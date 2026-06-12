import {
  createConsumerContainer,
  createWorkerContainer,
  type ServerEnv,
} from "@/core/application/di/serverCloudflare";
import type { Logger } from "@/core/application/ports/logger";
import type { RelayTrigger } from "@/core/application/ports/relayTrigger";
import { dispatchDomainEvent } from "@/core/application/workers/dispatchDomainEvent";
import {
  type EventDispatcher,
  type ProcessOutboxEventsOptions,
  processOutboxEvents,
} from "@/core/application/workers/eventRelayWorker";

/**
 * Dev-only {@link RelayTrigger} that drains the outbox **inside the
 * caller's isolate** by invoking `processOutboxEvents` + `dispatchDomainEvent`
 * directly, bypassing the Service Binding → Queue → consumer Worker
 * chain. Required because `pnpm dev` (Vite + `@cloudflare/vite-plugin`)
 * boots only the main Worker — the sibling relay / consumer / pruner /
 * dlq Workers and Cloudflare Queues are not running, so newly-persisted
 * outbox rows would otherwise sit idle until manual intervention.
 *
 * Wired exclusively from `app/server.cloudflare.ts` behind
 * {@link resolveInlineRelayGate} (Vite dev OR the local-only
 * `DEV_INLINE_RELAY` var under `pnpm start`); the entry guards the call
 * with `import.meta.env?.MODE !== "production"`, which `vite build`
 * inlines to `false` so this adapter cannot ship into staging or
 * production bundles.
 *
 * Contract behaviour:
 * - `kick()` schedules the drain via `waitUntil` and returns
 *   immediately, matching the fire-and-forget contract on
 *   {@link RelayTrigger}.
 * - Any internal failure is logged through the injected logger and
 *   swallowed; `kick()` itself never throws.
 *
 * Lifecycle inside `runOnce()`:
 * 1. Build a fresh `WorkerContainer` for the outbox repo + idempotency
 *    store handles.
 * 2. Build a `ConsumerContainer` with `env.RELAY` deliberately blanked
 *    out (see ADR-002 of Issue #66) so the inner UoW provider's
 *    secondary kick degrades to `NoopRelayTrigger`. This prevents an
 *    unbounded recursion (a kick during dispatch enqueuing another
 *    kick) and silences "service binding kick failed" log spam when
 *    the relay Worker is not running.
 * 3. Run `processOutboxEvents` with `{ maxIterations: 1, batchSize: 25,
 *    workerId: "inline-dev" }` so one kick drains at most one batch.
 *    Secondary rows enqueued during dispatch are picked up on the next
 *    UoW commit.
 * 4. Per event, call `idempotencyStore.hasProcessed` → `dispatchDomainEvent`
 *    → `markProcessed`, mirroring the production `handleQueue` contract.
 */
/**
 * Runtime gate deciding whether the dev-only {@link InlineRelayTrigger}
 * should be wired into the request container.
 *
 * - `viteDev` — `import.meta.env.DEV === true` under `pnpm dev`.
 * - `flag` — the `DEV_INLINE_RELAY` var. LOCAL `wrangler.toml [vars]`
 *   only; never add it to the staging / production toml templates.
 *
 * Disabling the path in production builds is NOT this function's
 * responsibility: the entry point (`app/server.cloudflare.ts`) places
 * the constant `import.meta.env?.MODE !== "production"` condition on
 * the left of a short-circuit `&&`, so `vite build` dead-code-eliminates
 * the whole branch — verified by the post-build grep in
 * docs/runtime_cloudflare.md.
 */
export function resolveInlineRelayGate(input: {
  viteDev: boolean;
  flag: string | undefined;
}): boolean {
  return input.viteDev === true || input.flag === "true";
}

export class InlineRelayTrigger implements RelayTrigger {
  constructor(
    private readonly env: ServerEnv,
    private readonly waitUntil: (promise: Promise<unknown>) => void,
    private readonly logger: Logger,
    private readonly options?: ProcessOutboxEventsOptions,
  ) {}

  kick(): void {
    this.waitUntil(
      (async () => {
        try {
          await this.runOnce();
        } catch (cause) {
          this.logger.error("[relay-trigger] inline dispatch failed", {
            cause,
          });
        }
      })(),
    );
  }

  private async runOnce(): Promise<void> {
    // Dev-only adapter: rebuild both containers on every `kick()`. This
    // mirrors production's `handleQueue`, which calls
    // `createConsumerContainer` per batch — the cost is acceptable
    // because `pnpm dev` runs in a single isolate and dispatch frequency
    // is low.
    const workerContainer = createWorkerContainer(this.env);
    // Blank out `RELAY` so the consumer container's UoW provider gets a
    // `NoopRelayTrigger`. ADR-002 of Issue #66: secondary outbox rows
    // wait for the next kick rather than recursing through a Service
    // Binding fetch that nothing answers under `pnpm dev`.
    const consumerEnv: ServerEnv = stripRelayBinding(this.env);
    const consumerContainer = await createConsumerContainer(consumerEnv);

    const dispatch: EventDispatcher = async (events) => {
      const outcomes = [];
      for (const event of events) {
        try {
          if (await consumerContainer.idempotencyStore.hasProcessed(event.id)) {
            outcomes.push({ kind: "success" as const, id: event.id });
            continue;
          }
          const outcome = await dispatchDomainEvent(consumerContainer, event);
          if (outcome.kind === "retry") {
            outcomes.push({
              kind: "failure" as const,
              id: event.id,
              error: outcome.error,
            });
            continue;
          }
          await consumerContainer.idempotencyStore.markProcessed(event.id);
          outcomes.push({ kind: "success" as const, id: event.id });
        } catch (error) {
          outcomes.push({
            kind: "failure" as const,
            id: event.id,
            error,
          });
        }
      }
      return outcomes;
    };

    const { processed } = await processOutboxEvents(workerContainer, dispatch, {
      ...this.options,
      maxIterations: 1,
      batchSize: 25,
      workerId: "inline-dev",
    });
    this.logger.info(`[relay-trigger] inline dispatch drained ${processed}`, {
      processed,
    });
  }
}

// Under `exactOptionalPropertyTypes`, assigning `RELAY: undefined` to
// an optional key is rejected by TS. So instead of overwriting in
// place, destructure `RELAY` out and re-spread the rest — this removes
// the key itself, which `buildRelayTrigger` treats as
// "no Service Binding → NoopRelayTrigger".
function stripRelayBinding(env: ServerEnv): ServerEnv {
  const { RELAY: _RELAY, ...rest } = env;
  return rest;
}
