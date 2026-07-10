import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import { MediaAsset, type OrphanMedia, type PendingMedia } from "../entity";
import { MediaErrorCode } from "../errorCode";
import type {
  MediaAssetRepository,
  MediaListOpts,
} from "../ports/mediaAssetRepository";
import {
  type ObjectMetadata,
  type ObjectStorage,
  StorageNotFoundError,
} from "../ports/objectStorage";
import { MediaService } from "../service";
import { MediaAssetId } from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;
const idOf = (n: number) => MediaAssetId.create(rawId(n));
const userId = (n: number) => UserId.create(`user-${n}`);

/**
 * Minimal in-memory `MediaAssetRepository` used to exercise `MediaService`
 * branches. Not a generally-available test fake — `docs/test.md` keeps
 * application-layer behavior tests on integration, but the domain service
 * is pure logic with a repo dependency so a local stub is the cleanest way
 * to assert its diff / orphan / visibility semantics.
 */
class InMemoryRepo implements MediaAssetRepository {
  private readonly store = new Map<string, MediaAsset>();

  put(asset: MediaAsset): void {
    this.store.set(asset.id, asset);
  }

  async findById(id: MediaAssetId): Promise<MediaAsset | null> {
    return this.store.get(id) ?? null;
  }

  async findByIds(
    ids: readonly MediaAssetId[],
  ): Promise<readonly MediaAsset[]> {
    return ids
      .map((id) => this.store.get(id))
      .filter((a): a is MediaAsset => a !== undefined);
  }

  async findByOwner(
    ownerId: UserId,
    _opts: MediaListOpts,
  ): Promise<readonly MediaAsset[]> {
    return Array.from(this.store.values()).filter((a) => a.ownerId === ownerId);
  }

  async aggregateByOwner(
    ownerId: UserId,
  ): Promise<Readonly<{ count: number; totalBytes: number }>> {
    const attached = Array.from(this.store.values()).filter(
      (a) => a.ownerId === ownerId && a.status === "attached",
    );
    return {
      count: attached.length,
      totalBytes: attached.reduce((sum, a) => sum + a.byteSize, 0),
    };
  }

  async findPurgeableOlderThan(
    before: Date,
    limit: number,
  ): Promise<readonly MediaAsset[]> {
    return Array.from(this.store.values())
      .filter(
        (a) =>
          (a.status === "orphan" || a.status === "deleting") &&
          a.updatedAt.getTime() < before.getTime(),
      )
      .slice(0, limit);
  }

  async findAbandonedSourceIntakes(
    before: Date,
    limit: number,
  ): Promise<readonly MediaAsset[]> {
    return Array.from(this.store.values())
      .filter(
        (a) =>
          a.status === "pending" &&
          a.kind === "source" &&
          a.updatedAt.getTime() < before.getTime(),
      )
      .slice(0, limit);
  }

  async save(asset: MediaAsset): Promise<void> {
    this.store.set(asset.id, asset);
  }

  async delete(id: MediaAssetId): Promise<void> {
    this.store.delete(id);
  }
}

class InMemoryStorage implements ObjectStorage {
  readonly deleted: string[] = [];
  presigns = 0;

  failDelete: ((key: string) => boolean) | null = null;
  failStat: ((key: string) => boolean) | null = null;

  async put(): Promise<void> {
    // unused in service tests
  }

  async get(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }

  async stat(key: string): Promise<ObjectMetadata> {
    if (this.failStat?.(key)) {
      throw new StorageNotFoundError(`missing: ${key}`);
    }
    return { byteSize: 0, contentType: "application/octet-stream" };
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete?.(key)) {
      throw new StorageNotFoundError(`missing: ${key}`);
    }
    this.deleted.push(key);
  }

  async presignDownload(): Promise<URL> {
    this.presigns += 1;
    return new URL("https://test.invalid/dl");
  }

  async presignUpload(): Promise<URL> {
    return new URL("https://test.invalid/up");
  }
}

function expectOrphan(asset: { status: string }): OrphanMedia {
  if (asset.status !== "orphan") {
    throw new Error(`expected orphan, got ${asset.status}`);
  }
  return asset as OrphanMedia;
}

const seedPending = (
  repo: InMemoryRepo,
  n: number,
  owner = 1,
): PendingMedia => {
  const { entity } = MediaAsset.create(
    {
      id: rawId(n),
      ownerId: userId(owner),
      kind: "image",
      mimeType: "image/png",
      byteSize: 1,
      storageKey: `${userId(owner)}/image/${rawId(n)}`,
    },
    T0,
  );
  repo.put(entity);
  return entity;
};

const seedPendingSource = (
  repo: InMemoryRepo,
  n: number,
  at: Date = T0,
  owner = 1,
): PendingMedia => {
  const { entity } = MediaAsset.create(
    {
      id: rawId(n),
      ownerId: userId(owner),
      kind: "source",
      mimeType: "application/pdf",
      byteSize: 1,
      storageKey: `${userId(owner)}/source/${rawId(n)}`,
    },
    at,
  );
  repo.put(entity);
  return entity;
};

describe("MediaService.reconcileRefs", () => {
  it("increments refCount and emits attached for ids only in `after`", async () => {
    const repo = new InMemoryRepo();
    seedPending(repo, 1);
    seedPending(repo, 2);

    await MediaService.reconcileRefs([], [idOf(1), idOf(2)], at(10), repo);

    const a1 = await repo.findById(idOf(1));
    const a2 = await repo.findById(idOf(2));
    expect(a1?.status).toBe("attached");
    expect(a2?.status).toBe("attached");
    if (a1?.status !== "attached" || a2?.status !== "attached") return;
    expect(a1.refCount).toBe(1);
    expect(a2.refCount).toBe(1);
  });

  it("decrements refCount and transitions to orphan when refCount drops to 0", async () => {
    const repo = new InMemoryRepo();
    seedPending(repo, 1);
    await MediaService.reconcileRefs([], [idOf(1)], T0, repo);
    await MediaService.reconcileRefs([idOf(1)], [], at(1), repo);

    const after = await repo.findById(idOf(1));
    expect(after?.status).toBe("orphan");
    expect(after?.refCount).toBe(0);
  });

  it("treats duplicate ids in either list as a single reference (set semantics)", async () => {
    const repo = new InMemoryRepo();
    seedPending(repo, 1);
    await MediaService.reconcileRefs([], [idOf(1), idOf(1), idOf(1)], T0, repo);
    const after = await repo.findById(idOf(1));
    expect(after?.status).toBe("attached");
    if (after?.status !== "attached") return;
    expect(after.refCount).toBe(1);
  });

  it("silently skips ids missing in storage on both arms", async () => {
    const repo = new InMemoryRepo();
    await MediaService.reconcileRefs([idOf(404)], [idOf(405)], T0, repo);
    expect(await repo.findById(idOf(404))).toBeNull();
    expect(await repo.findById(idOf(405))).toBeNull();
  });

  it("throws IllegalTransition when an added id is in orphan/deleting state", async () => {
    const repo = new InMemoryRepo();
    seedPending(repo, 1);
    // Take the asset through to orphan first.
    await MediaService.reconcileRefs([], [idOf(1)], T0, repo);
    await MediaService.reconcileRefs([idOf(1)], [], at(1), repo);
    expect((await repo.findById(idOf(1)))?.status).toBe("orphan");

    try {
      await MediaService.reconcileRefs([], [idOf(1)], at(2), repo);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.IllegalTransition);
      }
    }
  });

  it("removing an already-orphan id is a no-op (idempotent under at-least-once delivery)", async () => {
    const repo = new InMemoryRepo();
    seedPending(repo, 1);
    await MediaService.reconcileRefs([], [idOf(1)], T0, repo);
    await MediaService.reconcileRefs([idOf(1)], [], at(1), repo);
    // Re-delivery: still has the id in `before`, but the asset is orphan.
    await expect(
      MediaService.reconcileRefs([idOf(1)], [], at(2), repo),
    ).resolves.toBeUndefined();
    const after = await repo.findById(idOf(1));
    expect(after?.status).toBe("orphan");
    // The orphan transition timestamp must NOT be advanced by the redelivery,
    // otherwise the purge worker's age window would reset on every duplicate.
    expect(after?.updatedAt.getTime()).toBe(at(1).getTime());
  });
});

describe("MediaService.listPurgeCandidates", () => {
  it("returns orphans whose updatedAt is strictly older than now - ageSec", async () => {
    const repo = new InMemoryRepo();
    const pending = seedPending(repo, 1);
    const { entity: orphan } = MediaAsset.decrementRef(pending, at(1_000));
    repo.put(orphan);

    // ageSec = 1s → cutoff = now - 1s. updatedAt = 1_000ms = 1s.
    // Strict `<` so updatedAt == cutoff is excluded.
    const tooYoung = await MediaService.listPurgeCandidates(at(2_000), 1, repo);
    expect(tooYoung).toHaveLength(0);

    const oldEnough = await MediaService.listPurgeCandidates(
      at(3_000),
      1,
      repo,
    );
    expect(oldEnough).toHaveLength(1);
    expect(oldEnough[0]?.id).toBe(orphan.id);
  });

  it("also returns `deleting` rows whose earlier purge stalled (retry candidates)", async () => {
    const repo = new InMemoryRepo();
    const pending = seedPending(repo, 1);
    const { entity: orphan } = MediaAsset.decrementRef(pending, at(1_000));
    const { entity: deleting } = MediaAsset.markDeleting(
      orphan as OrphanMedia,
      at(1_000),
    );
    repo.put(deleting);

    const result = await MediaService.listPurgeCandidates(at(3_000), 1, repo);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(deleting.id);
    expect(result[0]?.status).toBe("deleting");
  });

  it("respects the limit", async () => {
    const repo = new InMemoryRepo();
    for (let i = 1; i <= 3; i += 1) {
      const pending = seedPending(repo, i);
      const { entity } = MediaAsset.decrementRef(pending, at(0));
      repo.put(entity);
    }
    const result = await MediaService.listPurgeCandidates(
      at(10_000),
      1,
      repo,
      2,
    );
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe("MediaService.listAbandonedSourceIntakes", () => {
  it("returns pending sources whose updatedAt is strictly older than now - graceSec", async () => {
    const repo = new InMemoryRepo();
    seedPendingSource(repo, 1, at(1_000));

    // graceSec = 1s → cutoff = now - 1s. updatedAt = 1_000ms = 1s.
    // Strict `<` so updatedAt == cutoff is excluded.
    const tooYoung = await MediaService.listAbandonedSourceIntakes(
      at(2_000),
      1,
      repo,
    );
    expect(tooYoung).toHaveLength(0);

    const oldEnough = await MediaService.listAbandonedSourceIntakes(
      at(3_000),
      1,
      repo,
    );
    expect(oldEnough).toHaveLength(1);
    expect(oldEnough[0]?.id).toBe(idOf(1));
  });

  it("does not return pending assets of other kinds", async () => {
    const repo = new InMemoryRepo();
    seedPending(repo, 1); // kind: image, updatedAt = T0

    const result = await MediaService.listAbandonedSourceIntakes(
      at(10_000),
      1,
      repo,
    );
    expect(result).toHaveLength(0);
  });

  it("respects the limit", async () => {
    const repo = new InMemoryRepo();
    for (let i = 1; i <= 3; i += 1) {
      seedPendingSource(repo, i, T0);
    }
    const result = await MediaService.listAbandonedSourceIntakes(
      at(10_000),
      1,
      repo,
      2,
    );
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe("MediaService.purge", () => {
  it("storage.delete + repo.delete when asset is deleting", async () => {
    const repo = new InMemoryRepo();
    const storage = new InMemoryStorage();
    const pending = seedPending(repo, 1);
    const { entity: orphan } = MediaAsset.decrementRef(pending, at(1));
    const { entity: deleting } = MediaAsset.markDeleting(
      expectOrphan(orphan),
      at(2),
    );
    repo.put(deleting);

    await MediaService.purge(deleting, storage, repo);

    expect(storage.deleted).toEqual([deleting.storageKey]);
    expect(await repo.findById(deleting.id)).toBeNull();
  });

  it("propagates StorageNotFoundError from storage.delete so the caller can record retry", async () => {
    // Per the spec testcase "R2 削除失敗 → リトライ対象として記録": MediaService.purge
    // itself does not swallow storage errors. The retry-tracking decision is
    // up to the orchestrator (PurgeOrphans usecase) which logs + counts the
    // failure. The service surface remains transparent.
    const repo = new InMemoryRepo();
    const storage = new InMemoryStorage();
    storage.failDelete = () => true;
    const pending = seedPending(repo, 1);
    const { entity: orphan } = MediaAsset.decrementRef(pending, at(1));
    const { entity: deleting } = MediaAsset.markDeleting(
      expectOrphan(orphan),
      at(2),
    );
    repo.put(deleting);

    await expect(MediaService.purge(deleting, storage, repo)).rejects.toThrow(
      StorageNotFoundError,
    );
    expect(await repo.findById(deleting.id)).not.toBeNull();
  });

  it("throws IllegalTransition when asset is not in `deleting`", async () => {
    const repo = new InMemoryRepo();
    const storage = new InMemoryStorage();
    const pending = seedPending(repo, 1);
    const { entity: orphan } = MediaAsset.decrementRef(pending, at(1));
    try {
      await MediaService.purge(orphan, storage, repo);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.IllegalTransition);
      }
    }
  });
});

describe("MediaService.assertViewableBy (DownloadMedia access matrix)", () => {
  const repo = new InMemoryRepo();
  const ownerAsset = (() => {
    const { entity } = MediaAsset.create(
      {
        id: rawId(50),
        ownerId: userId(1),
        kind: "image",
        mimeType: "image/png",
        byteSize: 1,
        storageKey: "u1/i/50",
      },
      T0,
    );
    return entity;
  })();
  void repo;

  it("owner self: passes regardless of related note visibility", () => {
    expect(() =>
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: userId(1),
        relatedNoteVisibility: null,
        hasShareLink: false,
      }),
    ).not.toThrow();
    expect(() =>
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: userId(1),
        relatedNoteVisibility: "private",
        hasShareLink: false,
      }),
    ).not.toThrow();
  });

  it("other viewer, related note public: passes", () => {
    expect(() =>
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: userId(2),
        relatedNoteVisibility: "public",
        hasShareLink: false,
      }),
    ).not.toThrow();
  });

  it("other viewer, related note unlisted with hasShareLink=true: passes", () => {
    expect(() =>
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: userId(2),
        relatedNoteVisibility: "unlisted",
        hasShareLink: true,
      }),
    ).not.toThrow();
  });

  it("other viewer, related note unlisted with hasShareLink=false: throws NotViewable", () => {
    try {
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: userId(2),
        relatedNoteVisibility: "unlisted",
        hasShareLink: false,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.NotViewable);
      }
    }
  });

  it("other viewer, related note private: throws NotViewable", () => {
    try {
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: userId(2),
        relatedNoteVisibility: "private",
        hasShareLink: false,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.NotViewable);
      }
    }
  });

  it("anonymous viewer, no related note: throws NotViewable", () => {
    try {
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: null,
        relatedNoteVisibility: null,
        hasShareLink: false,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.NotViewable);
      }
    }
  });

  it("anonymous viewer, related note public: passes", () => {
    expect(() =>
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: null,
        relatedNoteVisibility: "public",
        hasShareLink: false,
      }),
    ).not.toThrow();
  });

  it("anonymous viewer with unlisted related note and a share link passes", () => {
    expect(() =>
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: null,
        relatedNoteVisibility: "unlisted",
        hasShareLink: true,
      }),
    ).not.toThrow();
  });

  it("anonymous viewer with unlisted related note without share link is rejected", () => {
    try {
      MediaService.assertViewableBy({
        asset: ownerAsset,
        viewerOwnerId: null,
        relatedNoteVisibility: "unlisted",
        hasShareLink: false,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.NotViewable);
      }
    }
  });
});

describe("HandleNotePurgedEvent semantics via reconcileRefs", () => {
  it("refCount-- on referenced media (refs in `before`, empty `after`)", async () => {
    const repo = new InMemoryRepo();
    seedPending(repo, 1);
    seedPending(repo, 2);
    await MediaService.reconcileRefs([], [idOf(1), idOf(2)], T0, repo);

    await MediaService.reconcileRefs([idOf(1), idOf(2)], [], at(1), repo);

    const a1 = await repo.findById(idOf(1));
    const a2 = await repo.findById(idOf(2));
    expect(a1?.status).toBe("orphan");
    expect(a2?.status).toBe("orphan");
  });

  it("duplicate event delivery does not double-decrement orphans (idempotent)", async () => {
    const repo = new InMemoryRepo();
    seedPending(repo, 1);
    await MediaService.reconcileRefs([], [idOf(1)], T0, repo);
    await MediaService.reconcileRefs([idOf(1)], [], at(1), repo);
    const firstSnapshot = await repo.findById(idOf(1));

    // Replay the same purge "event" (same mediaRefs in `before`).
    await MediaService.reconcileRefs([idOf(1)], [], at(2), repo);
    const secondSnapshot = await repo.findById(idOf(1));

    expect(firstSnapshot?.status).toBe("orphan");
    expect(secondSnapshot?.status).toBe("orphan");
    expect(secondSnapshot?.refCount).toBe(0);
    // refCount stays at 0; updatedAt is NOT bumped on the redelivery so the
    // purge worker's age window does not reset.
    expect(secondSnapshot?.updatedAt.getTime()).toBe(
      firstSnapshot?.updatedAt.getTime(),
    );
  });
});
