import { describe, expect, it } from "vitest";
import type { RequestContainer } from "@/core/application/di/types";
import type { EventDraft } from "@/core/domain/common/event";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaAsset, type PendingMedia } from "@/core/domain/media/entity";
import type { MediaAssetRepository } from "@/core/domain/media/ports/mediaAssetRepository";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import { FakeLogger } from "../../__tests__/fakes";
import { sweepAbandonedSourceIntakes } from "../sweepAbandonedSourceIntakes";

// Unit coverage for the per-row defences that the integration suite
// cannot reach: an orphaned row never re-enters the candidate query, so
// the fresh `findById` guard (a row transitioning between candidate
// listing and its own UoW) and per-row failure isolation are driven here
// with a mutable fake repository instead.

const NOW = new Date("2026-06-01T00:00:00.000Z");
const OLD = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);

const rawId = (n: number) =>
  `019e0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const OWNER = "019e0001-0000-7000-8000-000000000001" as UserId;

function pendingSource(n: number) {
  const { entity } = MediaAsset.create(
    {
      id: rawId(n),
      ownerId: OWNER,
      kind: "source",
      mimeType: "application/pdf",
      byteSize: 1,
      storageKey: `${OWNER}/source/${rawId(n)}`,
    },
    OLD,
  );
  return entity;
}

/**
 * Minimal in-memory repo for the sweep's three port touchpoints. The
 * optional hooks inject the race / failure the test wants: `afterList`
 * runs after the candidate query returns (simulating a concurrent
 * transition), `failSaveIds` makes `save` throw for specific rows.
 */
class MutableFakeRepo {
  readonly store = new Map<string, MediaAsset>();
  afterList: (() => void) | null = null;
  failSaveIds = new Set<string>();
  lastListLimit: number | null = null;

  put(asset: MediaAsset): void {
    this.store.set(asset.id, asset);
  }

  async findById(id: MediaAssetId): Promise<MediaAsset | null> {
    return this.store.get(id) ?? null;
  }

  async findAbandonedSourceIntakes(
    before: Date,
    limit: number,
  ): Promise<readonly PendingMedia[]> {
    this.lastListLimit = limit;
    // Port contract: ordered oldest-first (updatedAt, then id), matching
    // the D1 implementation, so limit-crossing tests see the same rows.
    const rows = Array.from(this.store.values())
      .filter(MediaAsset.isPending)
      .filter(
        (a) => a.kind === "source" && a.updatedAt.getTime() < before.getTime(),
      )
      .sort(
        (a, b) =>
          a.updatedAt.getTime() - b.updatedAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit);
    this.afterList?.();
    return rows;
  }

  async save(asset: MediaAsset): Promise<void> {
    if (this.failSaveIds.has(asset.id)) {
      throw new Error(`simulated save failure for ${asset.id}`);
    }
    this.store.set(asset.id, asset);
  }
}

function makeContainer(repo: MutableFakeRepo): {
  container: RequestContainer;
  logger: FakeLogger;
  events: EventDraft[];
} {
  const logger = new FakeLogger();
  const events: EventDraft[] = [];
  const container = {
    clock: { now: () => NOW },
    logger,
    unitOfWorkProvider: {
      run: (
        fn: (ctx: {
          mediaAssetRepository: MediaAssetRepository;
          collectEvents: (drafts: readonly EventDraft[]) => void;
        }) => Promise<unknown>,
      ) =>
        fn({
          mediaAssetRepository: repo as unknown as MediaAssetRepository,
          collectEvents: (drafts) => {
            events.push(...drafts);
          },
        }),
    },
  } as unknown as RequestContainer;
  return { container, logger, events };
}

describe("sweepAbandonedSourceIntakes (unit)", () => {
  it("skips a candidate that was attached between listing and its per-row UoW (fresh findById guard)", async () => {
    const repo = new MutableFakeRepo();
    const candidate = pendingSource(1);
    repo.put(candidate);
    // Simulate a concurrent commit attaching the row right after the
    // candidate query returned it.
    repo.afterList = () => {
      const { entity } = MediaAsset.markAttached(candidate, NOW);
      repo.put(entity);
    };
    const { container, events } = makeContainer(repo);

    const result = await sweepAbandonedSourceIntakes(container, {
      graceSec: 0,
    });

    expect(result).toEqual({ swept: 0, failed: 0 });
    const after = repo.store.get(candidate.id);
    expect(after?.status).toBe("attached");
    expect(events).toHaveLength(0);
  });

  it("skips a candidate deleted between listing and its per-row UoW", async () => {
    const repo = new MutableFakeRepo();
    const candidate = pendingSource(1);
    repo.put(candidate);
    repo.afterList = () => {
      repo.store.delete(candidate.id);
    };
    const { container, events } = makeContainer(repo);

    const result = await sweepAbandonedSourceIntakes(container, {
      graceSec: 0,
    });

    expect(result).toEqual({ swept: 0, failed: 0 });
    expect(events).toHaveLength(0);
  });

  it("isolates a per-row failure: the failing row is counted and logged, the rest are swept", async () => {
    const repo = new MutableFakeRepo();
    const bad = pendingSource(1);
    const good = pendingSource(2);
    repo.put(bad);
    repo.put(good);
    repo.failSaveIds.add(bad.id);
    const { container, logger, events } = makeContainer(repo);

    const result = await sweepAbandonedSourceIntakes(container, {
      graceSec: 0,
    });

    expect(result).toEqual({ swept: 1, failed: 1 });
    expect(repo.store.get(bad.id)?.status).toBe("pending");
    expect(repo.store.get(good.id)?.status).toBe("orphan");
    const errors = logger.byLevel("error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(bad.id);
    expect(events.map((e) => e.type)).toEqual(["media.orphaned"]);
  });

  it("orphans an eligible pending source and emits media.orphaned", async () => {
    const repo = new MutableFakeRepo();
    const candidate = pendingSource(1);
    repo.put(candidate);
    const { container, events } = makeContainer(repo);

    const result = await sweepAbandonedSourceIntakes(container, {
      graceSec: 0,
      batchSize: 7,
    });

    expect(result).toEqual({ swept: 1, failed: 0 });
    // batchSize flows through to the candidate query's limit unchanged.
    expect(repo.lastListLimit).toBe(7);
    const after = repo.store.get(candidate.id);
    expect(after?.status).toBe("orphan");
    expect(after?.updatedAt.getTime()).toBe(NOW.getTime());
    expect(events.map((e) => e.type)).toEqual(["media.orphaned"]);
    expect(events[0]?.aggregateId).toBe(candidate.id);
  });
});
