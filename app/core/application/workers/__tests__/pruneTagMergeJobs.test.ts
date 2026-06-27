import { describe, expect, it, vi } from "vitest";
import { FakeActivityLogRepository } from "@/core/application/__tests__/fakes/fakeActivityLogRepository";
import type { WorkerContainer } from "@/core/application/di/types";
import type { Clock } from "@/core/application/ports/clock";
import type { JobStatePruner } from "@/core/application/ports/jobStatePruner";
import { FakeLogger } from "../../__tests__/fakes";
import {
  DEFAULT_TAG_MERGE_JOBS_RETENTION_MS,
  pruneTagMergeJobs,
} from "../pruneTagMergeJobs";

/**
 * Unit tests for `pruneTagMergeJobs`.
 *
 * A thin orchestrator over
 * {@link JobStatePruner.pruneTerminalTagMergeJobs}:
 *
 * - Cutoff = `clock.now() - retentionMs`, computed once and passed as a
 *   `Date`.
 * - The deleted count is forwarded verbatim.
 * - A structured info log is emitted (deleted / retentionMs / cutoff),
 *   even when nothing was deleted.
 * - The default retention is a multi-day window (AC-5).
 */

function makeFixedClock(at: Date): Clock {
  return { now: () => at };
}

type StubPrunerOptions = {
  deleted: number;
  tagMergeSpy?: (cutoff: Date) => void;
};

function makeStubJobStatePruner({
  deleted,
  tagMergeSpy,
}: StubPrunerOptions): JobStatePruner {
  return {
    pruneTerminalExportJobs: vi.fn(async () => ({ deleted: 0 })),
    pruneTerminalTagMergeJobs: vi.fn(async (cutoff: Date) => {
      tagMergeSpy?.(cutoff);
      return { deleted };
    }),
  };
}

function makeContainer(overrides: Partial<WorkerContainer>): WorkerContainer {
  const base: WorkerContainer = {
    outboxRepository: {
      save: vi.fn(async () => {}),
      claimPending: vi.fn(async () => []),
      finalize: vi.fn(async () => {}),
      pruneProcessed: vi.fn(async () => ({ deleted: 0 })),
    },
    idempotencyStore: {
      hasProcessed: vi.fn(async () => false),
      markProcessed: vi.fn(async () => ({ alreadyProcessed: false })),
      pruneProcessed: vi.fn(async () => ({ deleted: 0 })),
    },
    searchIndex: {
      upsert: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      query: vi.fn(async () => ({ hits: [], nextCursor: null })),
      bulkRebuildFromSnapshots: vi.fn(async () => {}),
      countByDateRanges: vi.fn(async () => []),
    },
    indexJobRepository: {
      enqueue: vi.fn(async () => {}),
      nextBatch: vi.fn(async () => []),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
    },
    activityLogRepository: new FakeActivityLogRepository(),
    llmCallLogRecorder: {
      recordCall: vi.fn(async () => {}),
      pruneOlderThan: vi.fn(async () => ({ deleted: 0 })),
    },
    jobStatePruner:
      overrides.jobStatePruner ?? makeStubJobStatePruner({ deleted: 0 }),
    clock: overrides.clock ?? { now: () => new Date(0) },
    idGenerator: {
      next: () => "00000000-0000-7000-8000-000000000000",
      validate: () => true,
    },
    logger: overrides.logger ?? new FakeLogger(),
  };
  return base;
}

describe("pruneTagMergeJobs", () => {
  it("computes the cutoff as clock.now() - retentionMs and forwards it as a Date", async () => {
    const now = new Date("2026-06-27T12:00:00Z");
    const retentionMs = DEFAULT_TAG_MERGE_JOBS_RETENTION_MS;
    let received: Date | undefined;
    const jobStatePruner = makeStubJobStatePruner({
      deleted: 2,
      tagMergeSpy: (cutoff) => {
        received = cutoff;
      },
    });
    const container = makeContainer({
      clock: makeFixedClock(now),
      jobStatePruner,
    });

    const result = await pruneTagMergeJobs(container, { retentionMs });

    expect(result).toEqual({ deleted: 2 });
    expect(received).toBeInstanceOf(Date);
    expect(received?.getTime()).toBe(now.getTime() - retentionMs);
    expect(jobStatePruner.pruneTerminalTagMergeJobs).toHaveBeenCalledTimes(1);
  });

  it("forwards the deleted count unchanged", async () => {
    const jobStatePruner = makeStubJobStatePruner({ deleted: 9 });
    const container = makeContainer({ jobStatePruner });

    const { deleted } = await pruneTagMergeJobs(container, {
      retentionMs: 1_000,
    });
    expect(deleted).toBe(9);
  });

  it("emits a structured info log with the deleted count, retention, and cutoff", async () => {
    const now = new Date("2026-06-27T12:00:00Z");
    const retentionMs = 60 * 1000;
    const logger = new FakeLogger();
    const container = makeContainer({
      clock: makeFixedClock(now),
      jobStatePruner: makeStubJobStatePruner({ deleted: 3 }),
      logger,
    });

    await pruneTagMergeJobs(container, { retentionMs });

    const infos = logger.byLevel("info");
    expect(infos).toHaveLength(1);
    expect(infos[0]?.message).toMatch(/\[tag-merge-jobs\] pruned 3/);
    expect(infos[0]?.meta?.deleted).toBe(3);
    expect(infos[0]?.meta?.retentionMs).toBe(retentionMs);
    expect(infos[0]?.meta?.cutoff).toBe(
      new Date(now.getTime() - retentionMs).toISOString(),
    );
  });

  it("logs even when nothing was deleted", async () => {
    const logger = new FakeLogger();
    const container = makeContainer({
      logger,
      jobStatePruner: makeStubJobStatePruner({ deleted: 0 }),
    });

    const { deleted } = await pruneTagMergeJobs(container, {
      retentionMs: 1_000,
    });

    expect(deleted).toBe(0);
    const infos = logger.byLevel("info");
    expect(infos).toHaveLength(1);
    expect(infos[0]?.meta?.deleted).toBe(0);
  });

  it("uses a multi-day default retention window", () => {
    expect(DEFAULT_TAG_MERGE_JOBS_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
