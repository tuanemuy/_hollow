import { describe, expect, it, vi } from "vitest";
import type { WorkerContainer } from "@/core/application/di/types";
import type { LlmCallLogRecorder } from "@/core/application/llmCallLog/ports";
import { LLM_CALL_LOG_RETENTION_HOURS } from "@/core/application/llmCallLog/types";
import type { Clock } from "@/core/application/ports/clock";
import { FakeLogger } from "../../__tests__/fakes";
import { pruneLlmCallLog } from "../pruneLlmCallLog";

/**
 * Unit tests for `pruneLlmCallLog` (#748): the worker computes a
 * `now - LLM_CALL_LOG_RETENTION_HOURS` cutoff and forwards it to the
 * recorder. No DB is touched; the recorder is a vitest spy.
 */

const HOUR_MS = 60 * 60 * 1000;

function makeFixedClock(at: Date): Clock {
  return { now: () => at };
}

function makeRecorder(
  deleted: number,
  spy?: (cutoff: Date) => void,
): LlmCallLogRecorder {
  return {
    recordCall: vi.fn(async () => {}),
    pruneOlderThan: vi.fn(async (cutoff: Date) => {
      spy?.(cutoff);
      return { deleted };
    }),
  };
}

function makeContainer(
  llmCallLogRecorder: LlmCallLogRecorder,
  clock: Clock,
  logger: FakeLogger,
): WorkerContainer {
  return { llmCallLogRecorder, clock, logger } as unknown as WorkerContainer;
}

describe("pruneLlmCallLog", () => {
  it("computes cutoff = now - LLM_CALL_LOG_RETENTION_HOURS and forwards it", async () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    let cutoff: Date | undefined;
    const recorder = makeRecorder(0, (c) => {
      cutoff = c;
    });
    const container = makeContainer(
      recorder,
      makeFixedClock(now),
      new FakeLogger(),
    );

    await pruneLlmCallLog(container);

    expect(cutoff?.getTime()).toBe(
      now.getTime() - LLM_CALL_LOG_RETENTION_HOURS * HOUR_MS,
    );
  });

  it("forwards the deleted count from the recorder", async () => {
    const recorder = makeRecorder(5);
    const container = makeContainer(
      recorder,
      makeFixedClock(new Date(0)),
      new FakeLogger(),
    );

    const result = await pruneLlmCallLog(container);

    expect(result).toEqual({ deleted: 5 });
  });
});
