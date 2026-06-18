import type { WorkerContainer } from "../di/types";

// Retain idempotency records (`processed_events`) for two weeks before
// the daily pruner sweeps them. A row is written *after* a successful
// dispatch, immediately before the queue message is acked, so the only
// window in which the row is still needed is a worker crash between the
// stamp and the ack: the message then redelivers until the queue's
// `message_retention_period` elapses. Cloudflare Queues cap that period
// at 14 days, so a 14-day retention outlives any possible redelivery
// regardless of how the queue is configured — pruning a younger row
// could resurrect a duplicate dispatch. Decoupled from
// `DEFAULT_OUTBOX_RETENTION_MS` on purpose: outbox retention is an audit
// grace, this one is an idempotency-correctness bound (Issue #747).
export const DEFAULT_PROCESSED_EVENTS_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export type PruneProcessedEventsOptions = {
  retentionMs: number;
};

export async function pruneProcessedEvents(
  container: WorkerContainer,
  options: PruneProcessedEventsOptions,
): Promise<{ deleted: number }> {
  const { clock, logger, idempotencyStore } = container;
  const cutoff = new Date(clock.now().getTime() - options.retentionMs);
  const { deleted } = await idempotencyStore.pruneProcessed(cutoff);
  logger.info(`[processed-events] pruned ${deleted} processed record(s)`, {
    deleted,
    retentionMs: options.retentionMs,
    cutoff: cutoff.toISOString(),
  });
  return { deleted };
}
