import type { WorkerContainer } from "../di/types";
import {
  CONSUME_INDEX_JOB_MAX_ATTEMPTS,
  consumeIndexJob,
} from "../search/consumeIndexJob";

/**
 * Default tuning values consumed by `readIndexerTuning` at the worker
 * entry boundary when the corresponding `[env.indexer.vars]` are unset.
 */
export const DEFAULT_INDEXER_BATCH_SIZE = 50;
export const DEFAULT_INDEXER_MAX_BATCHES = 20;

export type ProcessIndexJobsOptions = Readonly<{
  batchSize: number;
  maxBatches?: number;
}>;

/**
 * Per-tick counters surfaced to the operator via `runIndexJobTick`
 * logging.
 *
 * - `completed` — `consumeIndexJob` returned `{ kind: "completed" }`.
 *   The row has been marked processed via `IndexJobRepository.complete`.
 * - `retried` — `consumeIndexJob` returned `{ kind: "retry" }` after a
 *   transient adapter failure. `IndexJobRepository.fail` ran, so
 *   `attempts` advanced and the row is eligible for the next tick.
 * - `dlq` — `consumeIndexJob` returned `{ kind: "dlq" }`. The row has
 *   `attempts >= CONSUME_INDEX_JOB_MAX_ATTEMPTS` (or hit a non-retryable
 *   error) and is filtered out of subsequent `nextBatch` selections.
 * - `unexpectedFailures` — `consumeIndexJob` itself threw out of
 *   contract (logger / clock failure, programmer error, etc.). `fail`
 *   did **not** run, so `attempts` stays put and the same row will be
 *   re-selected on the next tick — distinct from `retried`, which
 *   reflects the advancing-attempt path. Operators watching the tail
 *   should treat a non-zero value as a bug signal, not a transient
 *   blip.
 */
export type ProcessIndexJobsResult = Readonly<{
  completed: number;
  retried: number;
  dlq: number;
  unexpectedFailures: number;
}>;

/**
 * Drain the `index_jobs` queue, dispatching each claimed job through
 * `consumeIndexJob`. Loops until either `nextBatch` returns empty (drained)
 * or `maxBatches` consecutive batches have been processed (cooperative
 * yield to the next cron tick).
 *
 * Rows with `attempts >= CONSUME_INDEX_JOB_MAX_ATTEMPTS` are filtered
 * out at the SQL layer by `IndexJobRepository.nextBatch`, so dlq rows
 * do not get re-selected on subsequent ticks. Admin re-drive remains
 * the recovery path (`bulkRebuildFromSnapshots` or direct `attempts`
 * reset — see `docs/runtime_cloudflare.md`).
 *
 * Per-row try/catch isolates one failing job from its batch siblings:
 * an unexpected row-level throw is logged with `outcome: "unexpected"`
 * and counted as `unexpectedFailures` (distinct from `retried`, which
 * is reserved for the advancing-attempt path), and the loop keeps
 * draining (CLAUDE.md "worker → root" partial-failure policy).
 */
export async function processIndexJobs(
  container: WorkerContainer,
  options: ProcessIndexJobsOptions,
): Promise<ProcessIndexJobsResult> {
  const batchSize = options.batchSize;
  const maxBatches = options.maxBatches ?? DEFAULT_INDEXER_MAX_BATCHES;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    return { completed: 0, retried: 0, dlq: 0, unexpectedFailures: 0 };
  }

  let completed = 0;
  let retried = 0;
  let dlq = 0;
  let unexpectedFailures = 0;

  for (let i = 0; i < maxBatches; i += 1) {
    const now = container.clock.now();
    const batch = await container.indexJobRepository.nextBatch(
      batchSize,
      now,
      CONSUME_INDEX_JOB_MAX_ATTEMPTS,
    );
    if (batch.length === 0) break;

    for (const job of batch) {
      try {
        const outcome = await consumeIndexJob({ container, input: { job } });
        if (outcome.kind === "completed") completed += 1;
        else if (outcome.kind === "retry") retried += 1;
        else dlq += 1;
      } catch (error) {
        // `consumeIndexJob` itself swallows expected adapter errors —
        // hitting this branch means something further out of contract
        // threw (e.g. logger / clock). `fail` has not run, so attempts
        // stay put and the same row will be re-selected next tick.
        // Tagged distinctly from the `retried` path so operators can
        // distinguish a real bug from an advancing-attempt retry.
        unexpectedFailures += 1;
        container.logger.error(
          `[indexer] unexpected throw processing index job ${job.id}`,
          {
            jobId: job.id,
            noteId: job.noteId,
            op: job.op,
            outcome: "unexpected",
            cause: error,
          },
        );
      }
    }

    // Short-circuit: smaller batch implies either drain or a concurrent
    // worker claimed the remainder. Either way, defer to the next tick.
    if (batch.length < batchSize) break;
  }

  return { completed, retried, dlq, unexpectedFailures };
}
