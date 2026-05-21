import type {
  ExecutionContext,
  MessageBatch,
  Queue,
} from "@cloudflare/workers-types";
import {
  createConsumerContainer,
  createWorkerContainer,
  readPruneTuning,
  readRelayTuning,
  type ServerEnv,
} from "@/core/application/di/serverCloudflare";
import { dispatchDomainEvent } from "@/core/application/workers/dispatchDomainEvent";
import {
  type EventDispatcher,
  type ProcessOutboxEventsOptions,
  processOutboxEvents,
} from "@/core/application/workers/eventRelayWorker";
import {
  type PruneOutboxOptions,
  pruneOutbox,
} from "@/core/application/workers/outboxPrune";
import type { DomainEvent } from "@/core/domain/common/event";

export type RelayEnv = ServerEnv &
  Readonly<{
    EVENTS_QUEUE: Queue<DomainEvent>;
  }>;

export type PrunerEnv = ServerEnv;

export type ConsumerEnv = ServerEnv;

export type DlqEnv = ServerEnv;

/**
 * `sendBatch` is all-or-nothing — on rejection every event is reported
 * as a failure so `processOutboxEvents` reschedules the whole batch
 * uniformly rather than splitting success/failure mid-flight.
 *
 * `override` lets tests / programmatic callers bypass the env-derived
 * tuning. In production both entry points (cron + Service Binding fetch)
 * pass nothing and the values come from `[env.relay.vars]`.
 */
export async function runRelayTick(
  env: RelayEnv,
  override?: ProcessOutboxEventsOptions,
): Promise<{ processed: number }> {
  const container = createWorkerContainer(env);
  const dispatch: EventDispatcher = async (events) => {
    if (events.length === 0) return [];
    try {
      await env.EVENTS_QUEUE.sendBatch(events.map((body) => ({ body })));
      return events.map((event) => ({
        kind: "success" as const,
        id: event.id,
      }));
    } catch (error) {
      return events.map((event) => ({
        kind: "failure" as const,
        id: event.id,
        error,
      }));
    }
  };
  return processOutboxEvents(container, dispatch, {
    ...readRelayTuning(env),
    ...override,
  });
}

/**
 * Quarantined rows (`failed_at IS NOT NULL`) are intentionally
 * preserved for operator inspection.
 */
export async function runPruneTick(
  env: PrunerEnv,
  override?: Partial<PruneOutboxOptions>,
): Promise<{ deleted: number }> {
  const container = createWorkerContainer(env);
  return pruneOutbox(container, { ...readPruneTuning(env), ...override });
}

/**
 * Queue consumer flow: `hasProcessed` → dispatch → success-only stamp.
 *
 * The stamp is post-dispatch so a transient failure inside the usecase
 * (e.g. `LLMRateLimitError` rethrown by `runIngestionJob`) leaves the
 * `processed_events` row absent, letting Cloudflare Queues redeliver
 * and re-enter dispatch. If the stamp ran first, the redelivery would
 * be skipped and the retry path would be silently broken (Issue #57
 * ADR-003).
 *
 * Double-execution after a worker crash between dispatch success and
 * the stamp is bounded by the aggregate-side defences: `isPending`
 * (or `isProcessing`) guards in `runIngestionJob` / `runExportJob`
 * plus the OCC `expectedVersion` on aggregate save converge to a
 * no-op on the second run.
 *
 * Operator safety net: a job permanently stuck in `pending` (e.g.
 * because every retry hit a rate limit and exhausted `max_retries`
 * into the DLQ) is recoverable via the admin manual-retry button
 * (Issue #3 — `retryIngestionJob` / `retryExportJob`).
 */
export async function handleQueue(
  batch: MessageBatch<DomainEvent>,
  env: ConsumerEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  const container = createConsumerContainer(env);
  for (const message of batch.messages) {
    const eventId = message.body.id;
    const eventType = message.body.type;
    try {
      if (await container.idempotencyStore.hasProcessed(eventId)) {
        container.logger.info(
          `[queue] skipping redelivery of ${eventType} ${eventId}`,
          { eventId },
        );
        message.ack();
        continue;
      }
      container.logger.info(`[queue] received ${eventType} ${eventId}`, {
        event: message.body,
      });
      const outcome = await dispatchDomainEvent(container, message.body);
      if (outcome.kind === "retry") {
        container.logger.warn(`[queue] dispatch retry for ${eventType}`, {
          eventId,
          cause: outcome.error,
        });
        message.retry();
        continue;
      }
      await container.idempotencyStore.markProcessed(eventId);
      message.ack();
    } catch (error) {
      container.logger.error(
        `[queue] handler failed for ${eventType} ${eventId}`,
        { eventId, cause: error },
      );
      message.retry();
    }
  }
}

/**
 * Always acks: the DLQ has no further dead-letter target, so a
 * re-failure would loop. Re-driving is a manual operator action once
 * the upstream cause is resolved.
 */
export async function handleDlq(
  batch: MessageBatch<DomainEvent>,
  env: DlqEnv,
  _ctx: ExecutionContext,
): Promise<void> {
  const container = createWorkerContainer(env);
  for (const message of batch.messages) {
    container.logger.error(
      `[dlq] event quarantined after retries: ${message.body.type} ${message.body.id}`,
      {
        eventId: message.body.id,
        eventType: message.body.type,
        attempts: message.attempts,
        event: message.body,
      },
    );
    message.ack();
  }
}
