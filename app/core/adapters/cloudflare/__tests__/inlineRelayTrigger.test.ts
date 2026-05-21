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

type CapturedRelay = Parameters<typeof buildRelayTrigger>[0];

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
    createConsumerContainer: vi.fn<(env: ServerEnv) => unknown>(),
    // Captured `relay` argument that `createConsumerContainer` saw via
    // the `buildRelayTrigger` call inside the inner DI wiring. Used by
    // the RELAY-stripping assertion (ADR-002).
    capturedConsumerRelay: { value: undefined as CapturedRelay | "unset" },
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
    createConsumerContainer: (env: ServerEnv) => {
      mocks.createConsumerContainer(env);
      // Mirror the production wiring decision: ConsumerContainer's UoW
      // provider receives `buildRelayTrigger(env.RELAY, ...)`. Capture
      // the resulting trigger so the test can assert RELAY-stripping
      // (ADR-002) via `instanceof`.
      const innerTrigger = actual.buildRelayTrigger(
        env.RELAY,
        (promise) => {
          void promise;
        },
        { info: () => {}, warn: () => {}, error: () => {} },
      );
      mocks.capturedConsumerRelay.value = env.RELAY;
      return {
        idempotencyStore: {
          hasProcessed: mocks.hasProcessed,
          markProcessed: mocks.markProcessed,
        },
        _innerRelayTrigger: innerTrigger,
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
  mocks.capturedConsumerRelay.value = "unset";
  // Default: hasProcessed false (force dispatch path).
  mocks.hasProcessed.mockResolvedValue(false);
  mocks.markProcessed.mockResolvedValue({ alreadyProcessed: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("InlineRelayTrigger.kick", () => {
  it("schedules the drain via waitUntil and returns synchronously", () => {
    mocks.processOutboxEvents.mockResolvedValue({ processed: 0 });
    const logger = new FakeLogger();
    const waitUntil = vi.fn<(p: Promise<unknown>) => void>();
    const trigger = new InlineRelayTrigger(ENV, waitUntil, logger);

    trigger.kick();

    expect(waitUntil).toHaveBeenCalledTimes(1);
    const arg = waitUntil.mock.calls[0]?.[0];
    expect(arg).toBeInstanceOf(Promise);
  });

  it("calls dispatchDomainEvent and markProcessed for each event when dispatch handles it", async () => {
    mocks.dispatchDomainEvent.mockResolvedValue({ kind: "handled" });
    mocks.processOutboxEvents.mockImplementation(async (_c, dispatch) => {
      const outcomes = await dispatch([EVENT_A, EVENT_B]);
      return { processed: outcomes.filter((o) => o.kind === "success").length };
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
  });

  it("returns failure (no markProcessed) when dispatch outcome is retry", async () => {
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

    // The captured ConsumerContainer build saw `RELAY === undefined`,
    // forcing `buildRelayTrigger` to return `NoopRelayTrigger` instead
    // of `ServiceBindingRelayTrigger`. Without the strip, the outer
    // `ENV_WITH_RELAY.RELAY` would have been threaded through.
    expect(mocks.createConsumerContainer).toHaveBeenCalledTimes(1);
    expect(mocks.capturedConsumerRelay.value).toBeUndefined();
  });

  it("when env.RELAY is set on the outer env, the outer wiring would have used ServiceBindingRelayTrigger — regression baseline for the strip above", () => {
    // Sanity check: without the strip, `buildRelayTrigger` would have
    // built a `ServiceBindingRelayTrigger` from the same env. This
    // anchors the previous test's assertion as meaningful rather than
    // vacuous.
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
});
