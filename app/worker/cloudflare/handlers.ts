import type {
  ExecutionContext,
  MessageBatch,
  Queue,
} from "@cloudflare/workers-types";
import {
  createConsumerContainer,
  createWorkerContainer,
  readIndexerTuning,
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
import {
  type ProcessIndexJobsOptions,
  type ProcessIndexJobsResult,
  processIndexJobs,
} from "@/core/application/workers/processIndexJobs";
import type { DomainEvent } from "@/core/domain/common/event";

export type RelayEnv = ServerEnv &
  Readonly<{
    EVENTS_QUEUE: Queue<DomainEvent>;
  }>;

export type PrunerEnv = ServerEnv;

export type ConsumerEnv = ServerEnv;

export type DlqEnv = ServerEnv;

export type IndexerEnv = ServerEnv;

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
 * Drain pending `index_jobs` rows through `consumeIndexJob`. Wired as
 * the indexer worker's `scheduled` trigger; also callable inline from
 * integration tests that want to verify the dispatcher → drainer pipe.
 *
 * Logs the per-tick outcome so an operator watching tail can see when
 * dlq counters trend upward. Rows with `attempts >=
 * CONSUME_INDEX_JOB_MAX_ATTEMPTS` are filtered out of `nextBatch` so
 * dlq rows do not get re-selected — admin re-drive remains the recovery
 * path (`bulkRebuildFromSnapshots` or direct `attempts` reset).
 */
export async function runIndexJobTick(
  env: IndexerEnv,
  override?: Partial<ProcessIndexJobsOptions>,
): Promise<ProcessIndexJobsResult> {
  const container = createWorkerContainer(env);
  const tuning = readIndexerTuning(env);
  const result = await processIndexJobs(container, { ...tuning, ...override });
  container.logger.info(
    `[indexer] tick complete: completed=${result.completed} retried=${result.retried} dlq=${result.dlq}`,
    { result },
  );
  return result;
}

/**
 * Queue consumer flow: `hasProcessed` → dispatch → success-only stamp.
 *
 * Stamp ordering: post-dispatch only. Transient errors that throw out
 * of dispatch (D1 timeouts, `hasProcessed` itself failing, an unhandled
 * domain throw) leave the `processed_events` row absent, so the queue's
 * redelivery re-enters dispatch. If the stamp ran first, the redelivery
 * would always be skipped and retry would be silently broken — Issue
 * #57 ADR-003. The outer try/catch covers the entire `hasProcessed →
 * dispatch → markProcessed` sequence so a throw anywhere in that span
 * routes the message to `retry()`.
 *
 * Double-execution after a worker crash between dispatch success and
 * the stamp is bounded by the aggregate-side defences in
 * `runIngestionJob` / `runExportJob`: an `isPending` guard plus an OCC
 * `expectedVersion` check converge to a no-op on the second run.
 *
 * Known limitation: the aggregate-side `isPending` guard means that
 * `LLMRateLimitError` rethrown after the usecase has committed
 * `pending → processing` cannot be auto-recovered. The next redelivery
 * no-ops, and after `max_retries` the message lands in the DLQ.
 * Operator recovery is the admin manual-retry button (Issue #3 —
 * `retryIngestionJob` / `retryExportJob` re-emit `*.retryRequested`).
 */
export async function handleQueue(
  batch: MessageBatch<DomainEvent>,
  env: ConsumerEnv,
  ctx: ExecutionContext,
): Promise<void> {
  const container = await createConsumerContainer(env, ctx);
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
