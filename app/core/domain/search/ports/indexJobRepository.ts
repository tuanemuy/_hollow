import type { IndexJob } from "../entity";
import type { IndexJobId } from "../valueObject";

/**
 * Queue-style port for `IndexJob`.
 *
 * The adapter is responsible for claim / lease semantics inside
 * `nextBatch` — the domain treats the returned jobs as already owned
 * by the caller. `complete` removes the row on successful dispatch;
 * `fail` increments attempts and stamps the failure message so the
 * row can be retried (or quarantined) by the adapter's policy.
 *
 * `nextBatch` takes a `maxAttempts` cap so DLQ rows (`attempts >=
 * maxAttempts`) are filtered out at the SQL layer. Without this guard
 * the queue-less drainer design would re-select dlq rows on every tick
 * and increment their attempts indefinitely (Issue #145 ADR-006).
 *
 * There is no OCC version on `IndexJob` — mutation flows through
 * dedicated verbs, not read-modify-write of the aggregate state, so
 * the contract here is intentionally narrower than
 * `TransactionalRepository`.
 */
export interface IndexJobRepository {
  enqueue(job: IndexJob): Promise<void>;
  nextBatch(
    limit: number,
    now: Date,
    maxAttempts: number,
  ): Promise<readonly IndexJob[]>;
  complete(id: IndexJobId): Promise<void>;
  fail(id: IndexJobId, error: string, now: Date): Promise<void>;
}
