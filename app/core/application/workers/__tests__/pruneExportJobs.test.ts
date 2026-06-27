import { describe, expect, it, vi } from "vitest";
import { FakeActivityLogRepository } from "@/core/application/__tests__/fakes/fakeActivityLogRepository";
import type { WorkerContainer } from "@/core/application/di/types";
import type { Clock } from "@/core/application/ports/clock";
import type { JobStatePruner } from "@/core/application/ports/jobStatePruner";
import { FakeLogger } from "../../__tests__/fakes";
import {
  DEFAULT_EXPORT_JOBS_RETENTION_MS,
  pruneExportJobs,
} from "../pruneExportJobs";

/**
 * Unit tests for `pruneExportJobs`.
 *
 * A thin orchestrator over {@link JobStatePruner.pruneTerminalExportJobs}:
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
  exportSpy?: (cutoff: Date) => void;
};

function makeStubJobStatePruner({
  deleted,
  exportSpy,
}: StubPrunerOptions): JobStatePruner {
  return {
    pruneTerminalExportJobs: vi.fn(async (cutoff: Date) => {
      exportSpy?.(cutoff);
      return { deleted };
    }),
    pruneTerminalTagMergeJobs: vi.fn(async () => ({ deleted: 0 })),
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

describe("pruneExportJobs", () => {
  it("computes the cutoff as clock.now() - retentionMs and forwards it as a Date", async () => {
    const now = new Date("2026-06-27T12:00:00Z");
    const retentionMs = DEFAULT_EXPORT_JOBS_RETENTION_MS;
    let received: Date | undefined;
    const jobStatePruner = makeStubJobStatePruner({
      deleted: 4,
      exportSpy: (cutoff) => {
        received = cutoff;
      },
    });
    const container = makeContainer({
      clock: makeFixedClock(now),
      jobStatePruner,
    });

    const result = await pruneExportJobs(container, { retentionMs });

    expect(result).toEqual({ deleted: 4 });
    expect(received).toBeInstanceOf(Date);
    expect(received?.getTime()).toBe(now.getTime() - retentionMs);
  });

  it("forwards the deleted count unchanged", async () => {
    const jobStatePruner = makeStubJobStatePruner({ deleted: 17 });
    const container = makeContainer({ jobStatePruner });

    const { deleted } = await pruneExportJobs(container, {
      retentionMs: 1_000,
    });
    expect(deleted).toBe(17);
  });

  it("emits a structured info log with the deleted count, retention, and cutoff", async () => {
    const now = new Date("2026-06-27T12:00:00Z");
    const retentionMs = 60 * 1000;
    const logger = new FakeLogger();
    const container = makeContainer({
      clock: makeFixedClock(now),
      jobStatePruner: makeStubJobStatePruner({ deleted: 5 }),
      logger,
    });

    await pruneExportJobs(container, { retentionMs });

    const infos = logger.byLevel("info");
    expect(infos).toHaveLength(1);
    expect(infos[0]?.message).toMatch(/\[export-jobs\] pruned 5/);
    expect(infos[0]?.meta?.deleted).toBe(5);
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

    const { deleted } = await pruneExportJobs(container, {
      retentionMs: 1_000,
    });

    expect(deleted).toBe(0);
    const infos = logger.byLevel("info");
    expect(infos).toHaveLength(1);
    expect(infos[0]?.meta?.deleted).toBe(0);
  });

  it("uses a multi-day default retention window", () => {
    expect(DEFAULT_EXPORT_JOBS_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
