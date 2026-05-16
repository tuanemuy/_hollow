import type { IndexJob } from "@/core/domain/search/entity";
import {
  isSearchIndexUnavailableError,
  isSearchTimeoutError,
} from "@/core/domain/search/ports/searchIndex";
import { SearchService } from "@/core/domain/search/service";
import type { WorkerContainer } from "../di/types";
import { SystemError, SystemErrorCode } from "../errors";

/**
 * Maximum number of attempts before a job is considered poison.
 *
 * Matches `spec/testcases/search/index.md` — after 3 failures the job
 * is reported as `dlq` and the worker entry routes the original
 * message to the queue's dead-letter target. Lower than the relay's
 * outbox `maxAttempts` (which guards the upstream dispatch) so a
 * persistently broken index does not block the producer side.
 */
export const CONSUME_INDEX_JOB_MAX_ATTEMPTS = 3;

export type ConsumeIndexJobInput = Readonly<{
  job: IndexJob;
}>;

/**
 * Outcome reported back to the worker entry.
 *
 * - `completed` — the index reflects the job; the row is marked
 *   processed (`complete`). The queue message can be `ack`ed.
 * - `retry` — a transient failure (index unavailable / timed out)
 *   was recorded via `recordAttempt + fail`; the queue message
 *   should be retried.
 * - `dlq` — the job has reached `attempts >= maxAttempts`. The row
 *   stays in the table with `last_error` populated so an operator
 *   can re-drive it once the upstream cause is fixed.
 */
export type ConsumeIndexJobOutcome =
  | { readonly kind: "completed" }
  | { readonly kind: "retry"; readonly error: string }
  | { readonly kind: "dlq"; readonly error: string };

/**
 * Worker-side consumer for a single `IndexJob`.
 *
 * Idempotency is delegated to the `SearchIndex` adapter: `upsert` is
 * keyed on `noteId` and `delete` is a no-op when the row is missing,
 * so re-running a successful job converges to the same state. The
 * caller is responsible for `ack`ing / retrying / dead-lettering the
 * queue message based on the returned `ConsumeIndexJobOutcome`.
 */
export async function consumeIndexJob(args: {
  container: WorkerContainer;
  input: ConsumeIndexJobInput;
}): Promise<ConsumeIndexJobOutcome> {
  const { container, input } = args;
  const { job } = input;
  const now = container.clock.now();
  try {
    if (job.op === "upsert") {
      if (job.snapshot === null) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Upsert IndexJob ${job.id} is missing the snapshot payload`,
        );
      }
      await SearchService.applyUpsert(job.snapshot, container.searchIndex, now);
    } else {
      await SearchService.applyDelete(job.noteId, container.searchIndex);
    }
    await container.indexJobRepository.complete(job.id);
    return { kind: "completed" };
  } catch (error) {
    const message = describeError(error);
    await container.indexJobRepository.fail(job.id, message, now);
    // `attempts` on the row is bumped by `fail`; the entity we hold
    // is the pre-failure snapshot, so derive the post-failure count
    // from `job.attempts + 1` to match the persisted state.
    const nextAttempts = (job.attempts as number) + 1;
    const isRetryable =
      isSearchIndexUnavailableError(error) || isSearchTimeoutError(error);
    if (!isRetryable || nextAttempts >= CONSUME_INDEX_JOB_MAX_ATTEMPTS) {
      container.logger.error(
        `[search] index job ${job.id} routed to DLQ after ${nextAttempts} attempts`,
        {
          jobId: job.id,
          noteId: job.noteId,
          op: job.op,
          attempts: nextAttempts,
          cause: error,
        },
      );
      return { kind: "dlq", error: message };
    }
    container.logger.warn(
      `[search] index job ${job.id} failed transiently; will retry`,
      {
        jobId: job.id,
        noteId: job.noteId,
        op: job.op,
        attempts: nextAttempts,
        cause: error,
      },
    );
    return { kind: "retry", error: message };
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
