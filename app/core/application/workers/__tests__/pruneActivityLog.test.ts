import { describe, expect, it, vi } from "vitest";
import type { ActivityLogRepository } from "@/core/application/activityLog/ports";
import {
  ACTIVITY_LOG_RETENTION_DAYS,
  INGESTION_BURST_LOG_RETENTION_HOURS,
} from "@/core/application/activityLog/types";
import type { WorkerContainer } from "@/core/application/di/types";
import type { Clock } from "@/core/application/ports/clock";
import { FakeLogger } from "../../__tests__/fakes";
import { pruneActivityLog } from "../pruneActivityLog";

/**
 * Unit tests for `pruneActivityLog` (Issue #595, N-005).
 *
 * The worker is a thin orchestrator that computes two cutoffs (activity log =
 * N days, burst log = N hours) and forwards each to the matching repository
 * method. These tests pin which cutoff reaches which method so a day-vs-hour
 * mix-up is caught, mirroring the sibling `outboxPrune.test.ts`. No DB is
 * touched; the repository methods are vitest spies.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function makeFixedClock(at: Date): Clock {
  return { now: () => at };
}

type StubOptions = {
  activityDeleted?: number;
  burstDeleted?: number;
  activitySpy?: (cutoff: Date) => void;
  burstSpy?: (cutoff: Date) => void;
};

function makeStubRepo({
  activityDeleted = 0,
  burstDeleted = 0,
  activitySpy,
  burstSpy,
}: StubOptions): ActivityLogRepository {
  return {
    insertIfAbsent: vi.fn(async () => {}),
    recordBurst: vi.fn(async () => {}),
    findRecent: vi.fn(async () => []),
    pruneOlderThan: vi.fn(async (cutoff: Date) => {
      activitySpy?.(cutoff);
      return { deleted: activityDeleted };
    }),
    pruneBurstOlderThan: vi.fn(async (cutoff: Date) => {
      burstSpy?.(cutoff);
      return { deleted: burstDeleted };
    }),
  };
}

function makeContainer(
  activityLogRepository: ActivityLogRepository,
  clock: Clock,
  logger: FakeLogger,
): WorkerContainer {
  return {
    activityLogRepository,
    clock,
    logger,
  } as unknown as WorkerContainer;
}

describe("pruneActivityLog", () => {
  it("computes activity cutoff = now - retentionDays and burst cutoff = now - retentionHours", async () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    let activityCutoff: Date | undefined;
    let burstCutoff: Date | undefined;
    const repo = makeStubRepo({
      activitySpy: (c) => {
        activityCutoff = c;
      },
      burstSpy: (c) => {
        burstCutoff = c;
      },
    });
    const container = makeContainer(
      repo,
      makeFixedClock(now),
      new FakeLogger(),
    );

    await pruneActivityLog(container);

    expect(activityCutoff?.getTime()).toBe(
      now.getTime() - ACTIVITY_LOG_RETENTION_DAYS * DAY_MS,
    );
    expect(burstCutoff?.getTime()).toBe(
      now.getTime() - INGESTION_BURST_LOG_RETENTION_HOURS * HOUR_MS,
    );
    // Guard against day/hour transposition: the activity cutoff is strictly
    // older than the burst cutoff (90 days >> 24 hours).
    expect(activityCutoff?.getTime()).toBeLessThan(burstCutoff?.getTime() ?? 0);
  });

  it("forwards both deleted counts from the repository", async () => {
    const repo = makeStubRepo({ activityDeleted: 7, burstDeleted: 13 });
    const container = makeContainer(
      repo,
      makeFixedClock(new Date(0)),
      new FakeLogger(),
    );

    const result = await pruneActivityLog(container);

    expect(result).toEqual({ activityDeleted: 7, burstDeleted: 13 });
  });

  it("emits a structured info log with both counts and cutoffs", async () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    const logger = new FakeLogger();
    const repo = makeStubRepo({ activityDeleted: 2, burstDeleted: 4 });
    const container = makeContainer(repo, makeFixedClock(now), logger);

    await pruneActivityLog(container);

    const infos = logger.byLevel("info");
    expect(infos).toHaveLength(1);
    const entry = infos[0];
    expect(entry?.meta?.activityDeleted).toBe(2);
    expect(entry?.meta?.burstDeleted).toBe(4);
    expect(entry?.meta?.activityCutoff).toBe(
      new Date(
        now.getTime() - ACTIVITY_LOG_RETENTION_DAYS * DAY_MS,
      ).toISOString(),
    );
    expect(entry?.meta?.burstCutoff).toBe(
      new Date(
        now.getTime() - INGESTION_BURST_LOG_RETENTION_HOURS * HOUR_MS,
      ).toISOString(),
    );
  });
});
