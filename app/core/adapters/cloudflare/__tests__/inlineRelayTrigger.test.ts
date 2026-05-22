import type { D1Database, Fetcher } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceBindingRelayTrigger } from "@/core/adapters/cloudflare/serviceBindingRelayTrigger";
import { FakeLogger } from "@/core/application/__tests__/fakes";
import {
  buildRelayTrigger,
  type ServerEnv,
} from "@/core/application/di/serverCloudflare";
import { NoopRelayTrigger } from "@/core/application/ports/relayTrigger";
import type { DispatchOutcome } from "@/core/application/workers/dispatchDomainEvent";
import type {
  EventDispatcher,
  ProcessOutboxEventsOptions,
} from "@/core/application/workers/eventRelayWorker";
import type { DomainEvent, EventId } from "@/core/domain/common/event";
import { InlineRelayTrigger } from "../inlineRelayTrigger";

// Module mocks: drive the dispatch path with synthetic events instead of
// reaching through a real D1 / outbox repository. The cloudflare-adapter
// boundary is what we're verifying — the inner worker pipeline has its
// own integration coverage.

const mocks = vi.hoisted(() => {
  return {
    dispatchDomainEvent:
      vi.fn<(...args: unknown[]) => Promise<DispatchOutcome>>(),
    processOutboxEvents:
      vi.fn<
        (
          container: unknown,
          dispatch: EventDispatcher,
          options?: ProcessOutboxEventsOptions,
        ) => Promise<{ processed: number }>
      >(),
    hasProcessed: vi.fn<(id: EventId) => Promise<boolean>>(),
    markProcessed:
      vi.fn<(id: EventId) => Promise<{ alreadyProcessed: boolean }>>(),
    createWorkerContainer: vi.fn<(env: ServerEnv) => unknown>(),
    createConsumerContainer: vi.fn<(env: ServerEnv) => Promise<unknown>>(),
  };
});

vi.mock("@/core/application/workers/dispatchDomainEvent", () => ({
  dispatchDomainEvent: mocks.dispatchDomainEvent,
}));

vi.mock(
  "@/core/application/workers/eventRelayWorker",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/core/application/workers/eventRelayWorker")
      >();
    return {
      ...actual,
      processOutboxEvents: mocks.processOutboxEvents,
    };
  },
);

vi.mock("@/core/application/di/serverCloudflare", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/core/application/di/serverCloudflare")
    >();
  return {
    ...actual,
    createWorkerContainer: (env: ServerEnv) => {
      mocks.createWorkerContainer(env);
      return { logger: actual };
    },
    createConsumerContainer: async (env: ServerEnv) => {
      await mocks.createConsumerContainer(env);
      return {
        idempotencyStore: {
          hasProcessed: mocks.hasProcessed,
          markProcessed: mocks.markProcessed,
        },
      };
    },
  };
});

const ENV: ServerEnv = {
  DB: {} as D1Database,
  APP_URL: "http://localhost:8787",
};

const ENV_WITH_RELAY: ServerEnv = {
  ...ENV,
  RELAY: {} as Fetcher,
};

function makeEvent(id: string): DomainEvent {
  return {
    id: id as EventId,
    type: "note.trashed",
    payload: { mediaRefs: [] } as unknown,
    occurredAt: new Date(0),
    aggregateId: "agg-id",
  } as DomainEvent;
}

const EVENT_A = makeEvent("01938f00-0000-7000-8000-aaaaaaaaaaaa");
const EVENT_B = makeEvent("01938f00-0000-7000-8000-bbbbbbbbbbbb");

async function flushWaitUntil(promises: Promise<unknown>[]): Promise<void> {
  await Promise.all(promises);
}

beforeEach(() => {
  mocks.dispatchDomainEvent.mockReset();
  mocks.processOutboxEvents.mockReset();
  mocks.hasProcessed.mockReset();
  mocks.markProcessed.mockReset();
  mocks.createWorkerContainer.mockReset();
  mocks.createConsumerContainer.mockReset();
  // Default: hasProcessed false (force dispatch path).
  mocks.hasProcessed.mockResolvedValue(false);
  mocks.markProcessed.mockResolvedValue({ alreadyProcessed: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("InlineRelayTrigger.kick", () => {
  it("schedules the drain via waitUntil and returns synchronously without invoking dispatch", () => {
    // Hold the inner promise so we can verify "nothing has run yet" at
    // kick-return time without flushing the queue.
    let resolveProcess: (value: { processed: number }) => void = () => {
      throw new Error("resolveProcess not initialized");
    };
    mocks.processOutboxEvents.mockReturnValue(
      new Promise<{ processed: number }>((resolve) => {
        resolveProcess = resolve;
      }),
    );

    const logger = new FakeLogger();
    const captured: Promise<unknown>[] = [];
    const waitUntil = vi.fn<(p: Promise<unknown>) => void>((p) => {
      captured.push(p);
    });
    const trigger = new InlineRelayTrigger(ENV, waitUntil, logger);

    trigger.kick();

    // Synchronous contract: waitUntil received exactly one promise and
    // dispatch / markProcessed have not been touched (the drain is
    // still queued behind the unresolved processOutboxEvents).
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(captured[0]).toBeInstanceOf(Promise);
    expect(mocks.dispatchDomainEvent).not.toHaveBeenCalled();
    expect(mocks.markProcessed).not.toHaveBeenCalled();

    // Resolve and flush so the test does not leak an unsettled promise
    // into adjacent cases.
    resolveProcess({ processed: 0 });
    return flushWaitUntil(captured);
  });

  // W-T-001: dev mostly emits `note.*` events whose dispatchers return
  // `skipped`, so parametrize both outcome shapes to guarantee both
  // paths route through markProcessed → success.
  it.each<{ outcome: DispatchOutcome }>([
    { outcome: { kind: "handled" } },
    { outcome: { kind: "skipped" } },
  ])("calls markProcessed and reports success when dispatch outcome is $outcome.kind", async ({
    outcome,
  }) => {
    mocks.dispatchDomainEvent.mockResolvedValue(outcome);
    mocks.processOutboxEvents.mockImplementation(async (_c, dispatch) => {
      const outcomes = await dispatch([EVENT_A, EVENT_B]);
      return {
        processed: outcomes.filter((o) => o.kind === "success").length,
      };
    });

    const pending: Promise<unknown>[] = [];
    const logger = new FakeLogger();
    const trigger = new InlineRelayTrigger(
      ENV,
      (p) => {
        pending.push(p);
      },
      logger,
    );
    trigger.kick();
    await flushWaitUntil(pending);

    expect(mocks.dispatchDomainEvent).toHaveBeenCalledTimes(2);
    expect(mocks.markProcessed).toHaveBeenCalledTimes(2);
    expect(mocks.markProcessed).toHaveBeenCalledWith(EVENT_A.id);
    expect(mocks.markProcessed).toHaveBeenCalledWith(EVENT_B.id);

    // W-T-008: assert the dispatch debug log fires so a regression
    // that silently drops observability is caught.
    const infos = logger.byLevel("info");
    expect(infos).toHaveLength(1);
    expect(infos[0]?.message).toBe("[relay-trigger] inline dispatch drained 2");
    expect(infos[0]?.meta).toEqual({ processed: 2 });
  });

  it("returns failure (no markProcessed) when dispatch outcome is retry", async () => {
    // W-T-006: this case verifies only the dispatch contract — the
    // outer `failure` outcome and the absence of `markProcessed`. The
    // claim "attempts gets incremented when dispatch returns retry"
    // belongs to `processOutboxEvents`' own tests; here `processOutboxEvents`
    // is mocked, so we cannot (and should not) re-assert that.
    const cause = new Error("boom");
    mocks.dispatchDomainEvent.mockResolvedValue({
      kind: "retry",
      error: cause,
    });

    let capturedOutcomes: Awaited<ReturnType<EventDispatcher>> = [];
    mocks.processOutboxEvents.mockImplementation(async (_c, dispatch) => {
      capturedOutcomes = await dispatch([EVENT_A]);
      return { processed: 0 };
    });

    const pending: Promise<unknown>[] = [];
    const trigger = new InlineRelayTrigger(
      ENV,
      (p) => {
        pending.push(p);
      },
      new FakeLogger(),
    );
    trigger.kick();
    await flushWaitUntil(pending);

    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(capturedOutcomes).toHaveLength(1);
    expect(capturedOutcomes[0]).toEqual({
      kind: "failure",
      id: EVENT_A.id,
      error: cause,
    });
  });

  it("treats hasProcessed=true as success without calling dispatchDomainEvent or markProcessed", async () => {
    mocks.hasProcessed.mockResolvedValueOnce(true);
    let capturedOutcomes: Awaited<ReturnType<EventDispatcher>> = [];
    mocks.processOutboxEvents.mockImplementation(async (_c, dispatch) => {
      capturedOutcomes = await dispatch([EVENT_A]);
      return {
        processed: capturedOutcomes.filter((o) => o.kind === "success").length,
      };
    });

    const pending: Promise<unknown>[] = [];
    const trigger = new InlineRelayTrigger(
      ENV,
      (p) => {
        pending.push(p);
      },
      new FakeLogger(),
    );
    trigger.kick();
    await flushWaitUntil(pending);

    expect(mocks.dispatchDomainEvent).not.toHaveBeenCalled();
    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(capturedOutcomes).toEqual([{ kind: "success", id: EVENT_A.id }]);
  });

  it("captures thrown errors inside dispatch as failure outcomes (no markProcessed)", async () => {
    const cause = new Error("dispatch threw");
    mocks.dispatchDomainEvent.mockRejectedValue(cause);
    let capturedOutcomes: Awaited<ReturnType<EventDispatcher>> = [];
    mocks.processOutboxEvents.mockImplementation(async (_c, dispatch) => {
      capturedOutcomes = await dispatch([EVENT_A]);
      return { processed: 0 };
    });

    const pending: Promise<unknown>[] = [];
    const trigger = new InlineRelayTrigger(
      ENV,
      (p) => {
        pending.push(p);
      },
      new FakeLogger(),
    );
    trigger.kick();
    await flushWaitUntil(pending);

    expect(mocks.markProcessed).not.toHaveBeenCalled();
    expect(capturedOutcomes).toEqual([
      { kind: "failure", id: EVENT_A.id, error: cause },
    ]);
  });

  it("does not throw from kick() when processOutboxEvents rejects (fire-and-forget contract)", async () => {
    const cause = new Error("processOutboxEvents threw");
    mocks.processOutboxEvents.mockRejectedValue(cause);

    const pending: Promise<unknown>[] = [];
    const logger = new FakeLogger();
    const trigger = new InlineRelayTrigger(
      ENV,
      (p) => {
        pending.push(p);
      },
      logger,
    );

    expect(() => trigger.kick()).not.toThrow();
    await flushWaitUntil(pending);

    expect(logger.byLevel("error")).toHaveLength(1);
    expect(logger.byLevel("error")[0]?.message).toContain(
      "[relay-trigger] inline dispatch failed",
    );
  });

  it("invokes processOutboxEvents with the fixed dev tuning {maxIterations:1, batchSize:25, workerId:'inline-dev'}", async () => {
    mocks.processOutboxEvents.mockResolvedValue({ processed: 0 });

    const pending: Promise<unknown>[] = [];
    const trigger = new InlineRelayTrigger(
      ENV,
      (p) => {
        pending.push(p);
      },
      new FakeLogger(),
    );
    trigger.kick();
    await flushWaitUntil(pending);

    expect(mocks.processOutboxEvents).toHaveBeenCalledTimes(1);
    const passedOptions = mocks.processOutboxEvents.mock.calls[0]?.[2];
    expect(passedOptions).toMatchObject({
      maxIterations: 1,
      batchSize: 25,
      workerId: "inline-dev",
    });
  });

  it("strips env.RELAY when building the inner ConsumerContainer (ADR-002: secondary kick degrades to NoopRelayTrigger)", async () => {
    mocks.processOutboxEvents.mockResolvedValue({ processed: 0 });

    const pending: Promise<unknown>[] = [];
    const trigger = new InlineRelayTrigger(
      ENV_WITH_RELAY,
      (p) => {
        pending.push(p);
      },
      new FakeLogger(),
    );
    trigger.kick();
    await flushWaitUntil(pending);

    // Direct assertion on `createConsumerContainer`'s first call: the
    // `RELAY` key must be absent / undefined so the inner UoW provider
    // sees no Service Binding and `buildRelayTrigger` returns
    // `NoopRelayTrigger` instead of `ServiceBindingRelayTrigger`.
    expect(mocks.createConsumerContainer).toHaveBeenCalledTimes(1);
    const consumerEnv = mocks.createConsumerContainer.mock.calls[0]?.[0] as
      | ServerEnv
      | undefined;
    expect(consumerEnv?.RELAY).toBeUndefined();
  });

  // W-T-005: kept intentionally as an ADR-002 anchor. Without this
  // baseline, the "strips env.RELAY" assertion could become vacuous if
  // `buildRelayTrigger`'s contract ever flips (e.g. defaulting to Noop
  // even for a non-undefined RELAY). DRY against `serverCloudflare.test.ts`
  // is acceptable because this lives next to the strip assertion.
  it("regression baseline: buildRelayTrigger returns ServiceBindingRelayTrigger for a non-undefined RELAY, Noop otherwise (ADR-002 precondition anchor)", () => {
    const outerTrigger = buildRelayTrigger(
      ENV_WITH_RELAY.RELAY,
      () => undefined,
      { info: () => {}, warn: () => {}, error: () => {} },
    );
    expect(outerTrigger).toBeInstanceOf(ServiceBindingRelayTrigger);

    const noopForUndefined = buildRelayTrigger(undefined, () => undefined, {
      info: () => {},
      warn: () => {},
      error: () => {},
    });
    expect(noopForUndefined).toBe(NoopRelayTrigger);
  });

  it("merges caller-supplied options without overriding workerId/maxIterations/batchSize defaults when omitted", async () => {
    mocks.processOutboxEvents.mockResolvedValue({ processed: 0 });

    const pending: Promise<unknown>[] = [];
    const trigger = new InlineRelayTrigger(
      ENV,
      (p) => {
        pending.push(p);
      },
      new FakeLogger(),
      { leaseMs: 1000 },
    );
    trigger.kick();
    await flushWaitUntil(pending);

    const passedOptions = mocks.processOutboxEvents.mock.calls[0]?.[2];
    expect(passedOptions).toMatchObject({
      maxIterations: 1,
      batchSize: 25,
      workerId: "inline-dev",
      leaseMs: 1000,
    });
  });

  // W-DA-002 / W-PE-002 regression: even when the caller explicitly
  // passes the fixed-3 values, they must be overridden by the
  // hardcoded dev defaults (spread-order guard). Without this, a
  // misconfigured caller could turn a one-batch dev drain into an
  // unbounded loop, or shadow the `inline-dev` workerId used to
  // distinguish dev-claimed leases.
  it("ignores caller-supplied maxIterations/batchSize/workerId — dev fixed-3 always win", async () => {
    mocks.processOutboxEvents.mockResolvedValue({ processed: 0 });

    const pending: Promise<unknown>[] = [];
    const trigger = new InlineRelayTrigger(
      ENV,
      (p) => {
        pending.push(p);
      },
      new FakeLogger(),
      {
        maxIterations: 999,
        batchSize: 1,
        workerId: "rogue-caller",
        leaseMs: 1000,
      },
    );
    trigger.kick();
    await flushWaitUntil(pending);

    const passedOptions = mocks.processOutboxEvents.mock.calls[0]?.[2];
    expect(passedOptions).toMatchObject({
      maxIterations: 1,
      batchSize: 25,
      workerId: "inline-dev",
      leaseMs: 1000,
    });
  });
});
