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
 * There is no OCC version on `IndexJob` — mutation flows through
 * dedicated verbs, not read-modify-write of the aggregate state, so
 * the contract here is intentionally narrower than
 * `TransactionalRepository`.
 */
export interface IndexJobRepository {
  enqueue(job: IndexJob): Promise<void>;
  nextBatch(limit: number, now: Date): Promise<readonly IndexJob[]>;
  complete(id: IndexJobId): Promise<void>;
  fail(id: IndexJobId, error: string, now: Date): Promise<void>;
}
