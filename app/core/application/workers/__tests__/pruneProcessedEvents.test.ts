import { describe, expect, it, vi } from "vitest";
import { FakeActivityLogRepository } from "@/core/application/__tests__/fakes/fakeActivityLogRepository";
import type { WorkerContainer } from "@/core/application/di/types";
import type { Clock } from "@/core/application/ports/clock";
import type { IdempotencyStore } from "@/core/application/ports/idempotencyStore";
import { FakeLogger } from "../../__tests__/fakes";
import {
  DEFAULT_PROCESSED_EVENTS_RETENTION_MS,
  pruneProcessedEvents,
} from "../pruneProcessedEvents";

/**
 * Unit tests for `pruneProcessedEvents`.
 *
 * The worker is a thin orchestrator around the idempotency store — these
 * tests pin the contract:
 *
 * - Cutoff = `clock.now() - retentionMs`, computed exactly once.
 * - `idempotencyStore.pruneProcessed` receives that cutoff as a `Date`.
 * - Result count is forwarded verbatim.
 * - An info log line is emitted with structured metadata.
 *
 * No DB is touched; the `IdempotencyStore` is faked through a vitest mock
 * so we can assert exactly which `Date` reaches the adapter.
 */

function makeFixedClock(at: Date): Clock {
  return { now: () => at };
}

type StubStoreOptions = {
  deleted: number;
  pruneSpy?: (olderThan: Date) => void;
};

function makeStubIdempotencyStore({
  deleted,
  pruneSpy,
}: StubStoreOptions): IdempotencyStore {
  return {
    hasProcessed: vi.fn(async () => false),
    markProcessed: vi.fn(async () => ({ alreadyProcessed: false })),
    pruneProcessed: vi.fn(async (olderThan: Date) => {
      pruneSpy?.(olderThan);
      return { deleted };
    }),
  };
}

function makeContainer(overrides: Partial<WorkerContainer>): WorkerContainer {
  // The worker reaches for `clock`, `logger`, `idempotencyStore`. The
  // remaining shared deps are stubbed at minimal viable shape since they
  // aren't observed by `pruneProcessedEvents`.
  const base: WorkerContainer = {
    outboxRepository: overrides.outboxRepository ?? {
      save: vi.fn(async () => {}),
      claimPending: vi.fn(async () => []),
      finalize: vi.fn(async () => {}),
      pruneProcessed: vi.fn(async () => ({ deleted: 0 })),
    },
    idempotencyStore:
      overrides.idempotencyStore ?? makeStubIdempotencyStore({ deleted: 0 }),
    searchIndex: overrides.searchIndex ?? {
      upsert: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      query: vi.fn(async () => ({ hits: [], nextCursor: null })),
      bulkRebuildFromSnapshots: vi.fn(async () => {}),
      countByDateRanges: vi.fn(async () => []),
    },
    indexJobRepository: overrides.indexJobRepository ?? {
      enqueue: vi.fn(async () => {}),
      nextBatch: vi.fn(async () => []),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
    },
    activityLogRepository:
      overrides.activityLogRepository ?? new FakeActivityLogRepository(),
    clock: overrides.clock ?? { now: () => new Date(0) },
    idGenerator: overrides.idGenerator ?? {
      next: () => "00000000-0000-7000-8000-000000000000",
      validate: () => true,
    },
    logger: overrides.logger ?? new FakeLogger(),
  };
  return base;
}

describe("pruneProcessedEvents", () => {
  it("computes the cutoff as clock.now() - retentionMs and forwards it to the store", async () => {
    const now = new Date("2026-04-27T12:00:00Z");
    const retentionMs = DEFAULT_PROCESSED_EVENTS_RETENTION_MS; // 14 days
    let received: Date | undefined;
    const idempotencyStore = makeStubIdempotencyStore({
      deleted: 3,
      pruneSpy: (olderThan) => {
        received = olderThan;
      },
    });
    const container = makeContainer({
      clock: makeFixedClock(now),
      idempotencyStore,
    });

    const result = await pruneProcessedEvents(container, { retentionMs });

    expect(result).toEqual({ deleted: 3 });
    expect(received).toBeInstanceOf(Date);
    expect(received?.getTime()).toBe(now.getTime() - retentionMs);
  });

  it("returns the count from the store unchanged", async () => {
    const idempotencyStore = makeStubIdempotencyStore({ deleted: 42 });
    const container = makeContainer({ idempotencyStore });

    const { deleted } = await pruneProcessedEvents(container, {
      retentionMs: 1_000,
    });
    expect(deleted).toBe(42);
  });

  it("emits a structured info log with the deleted count, retention, and cutoff", async () => {
    const now = new Date("2026-04-27T12:00:00Z");
    const retentionMs = 60 * 1000;
    const logger = new FakeLogger();
    const idempotencyStore = makeStubIdempotencyStore({ deleted: 5 });
    const container = makeContainer({
      clock: makeFixedClock(now),
      idempotencyStore,
      logger,
    });

    await pruneProcessedEvents(container, { retentionMs });

    const infos = logger.byLevel("info");
    expect(infos).toHaveLength(1);
    const entry = infos[0];
    expect(entry?.message).toMatch(/pruned 5/);
    expect(entry?.meta?.deleted).toBe(5);
    expect(entry?.meta?.retentionMs).toBe(retentionMs);
    expect(entry?.meta?.cutoff).toBe(
      new Date(now.getTime() - retentionMs).toISOString(),
    );
  });

  it("logs even when nothing was deleted", async () => {
    const logger = new FakeLogger();
    const container = makeContainer({
      logger,
      idempotencyStore: makeStubIdempotencyStore({ deleted: 0 }),
    });

    const { deleted } = await pruneProcessedEvents(container, {
      retentionMs: 1_000,
    });

    expect(deleted).toBe(0);
    const infos = logger.byLevel("info");
    expect(infos).toHaveLength(1);
    expect(infos[0]?.meta?.deleted).toBe(0);
  });
});
