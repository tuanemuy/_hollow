import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeLogger } from "@/core/application/__tests__/fakes";
import type { ServerEnv } from "@/core/application/di/serverCloudflare";
import { runPruneTick } from "../handlers";

/**
 * Unit coverage for `runPruneTick`'s orchestration — specifically the
 * best-effort contract introduced for the multi-table daily sweep:
 *
 * - The outbox prune runs first and may throw (nothing committed yet).
 * - The processed-events and activity-log prunes run *after* the
 *   already-committed outbox delete, so a failure in either must be
 *   swallowed (logged at `error`) and must not unwind the tick.
 * - A swallowed processed-events failure surfaces as a `0` count.
 *
 * The inner prune functions and DI are mocked so we can drive each
 * failure branch deterministically without a D1 binding (the real-DB
 * happy path lives in `handlers.integration.test.ts`).
 */

const mocks = vi.hoisted(() => ({
  logger: undefined as unknown as FakeLogger,
  pruneOutbox: vi.fn<() => Promise<{ deleted: number }>>(),
  pruneProcessedEvents: vi.fn<() => Promise<{ deleted: number }>>(),
  pruneActivityLog: vi.fn<() => Promise<void>>(),
  pruneLlmCallLog: vi.fn<() => Promise<{ deleted: number }>>(),
}));

vi.mock("@/core/application/di/serverCloudflare", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/core/application/di/serverCloudflare")
    >();
  return {
    ...actual,
    createWorkerContainer: () => ({ logger: mocks.logger }),
    readPruneTuning: () => ({
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      processedEventsRetentionMs: 14 * 24 * 60 * 60 * 1000,
    }),
  };
});

// Partial mocks: `env.ts` imports the `DEFAULT_*` retention constants
// from these modules, so the real exports must survive — only the prune
// functions are swapped.
vi.mock("@/core/application/workers/outboxPrune", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/core/application/workers/outboxPrune")
  >()),
  pruneOutbox: mocks.pruneOutbox,
}));

vi.mock(
  "@/core/application/workers/pruneProcessedEvents",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/core/application/workers/pruneProcessedEvents")
    >()),
    pruneProcessedEvents: mocks.pruneProcessedEvents,
  }),
);

vi.mock(
  "@/core/application/workers/pruneActivityLog",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/core/application/workers/pruneActivityLog")
    >()),
    pruneActivityLog: mocks.pruneActivityLog,
  }),
);

vi.mock(
  "@/core/application/workers/pruneLlmCallLog",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/core/application/workers/pruneLlmCallLog")
    >()),
    pruneLlmCallLog: mocks.pruneLlmCallLog,
  }),
);

const ENV = {
  DB: {},
  APP_URL: "http://localhost:8787",
} as unknown as ServerEnv;

beforeEach(() => {
  mocks.logger = new FakeLogger();
  mocks.pruneOutbox.mockReset().mockResolvedValue({ deleted: 3 });
  mocks.pruneProcessedEvents.mockReset().mockResolvedValue({ deleted: 5 });
  mocks.pruneActivityLog.mockReset().mockResolvedValue(undefined);
  mocks.pruneLlmCallLog.mockReset().mockResolvedValue({ deleted: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("runPruneTick", () => {
  it("returns both counts and runs the activity prune on the happy path", async () => {
    const result = await runPruneTick(ENV);

    expect(result).toEqual({ outboxDeleted: 3, processedEventsDeleted: 5 });
    expect(mocks.pruneActivityLog).toHaveBeenCalledTimes(1);
    expect(mocks.logger.byLevel("error")).toHaveLength(0);
  });

  it("swallows a processed-events failure: returns 0, logs an error, still preserves the outbox count and runs the activity prune", async () => {
    mocks.pruneProcessedEvents.mockRejectedValueOnce(new Error("d1 timeout"));

    const result = await runPruneTick(ENV);

    // Outbox already committed — its count is preserved and the failed
    // processed-events prune surfaces as 0 rather than unwinding the tick.
    expect(result).toEqual({ outboxDeleted: 3, processedEventsDeleted: 0 });
    const errors = mocks.logger.byLevel("error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/processed-events prune failed/);
    // The downstream activity prune is independent of the failure.
    expect(mocks.pruneActivityLog).toHaveBeenCalledTimes(1);
  });

  it("swallows an activity-log failure without affecting the returned counts", async () => {
    mocks.pruneActivityLog.mockRejectedValueOnce(new Error("d1 timeout"));

    const result = await runPruneTick(ENV);

    expect(result).toEqual({ outboxDeleted: 3, processedEventsDeleted: 5 });
    const errors = mocks.logger.byLevel("error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/activity-log prune failed/);
  });

  it("propagates an outbox prune failure — nothing is committed yet so the tick fails loud", async () => {
    mocks.pruneOutbox.mockRejectedValueOnce(new Error("d1 timeout"));

    await expect(runPruneTick(ENV)).rejects.toThrow("d1 timeout");
    // The post-commit prunes never run when the outbox prune throws.
    expect(mocks.pruneProcessedEvents).not.toHaveBeenCalled();
    expect(mocks.pruneActivityLog).not.toHaveBeenCalled();
    expect(mocks.pruneLlmCallLog).not.toHaveBeenCalled();
  });
});
