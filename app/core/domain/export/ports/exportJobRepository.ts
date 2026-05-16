import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { ExportJob } from "../entity";
import type { ExportJobId } from "../valueObject";

/**
 * Listing options for owner-scoped queries.
 *
 * The list is offset-limit rather than cursor-based — export job
 * volume per user is bounded and recency-ordered listings dominate
 * the UX.
 */
export type ExportJobListOpts = Readonly<{
  limit: number;
  offset: number;
  order?: "asc" | "desc";
}>;

/**
 * `ExportJobRepository` inherits the OCC-enforced contract
 * (`insert` / `findById` / `save` / `delete`) from
 * `TransactionalRepository<ExportJob>` and adds the read-only queries
 * that export usecases and the prune worker need.
 *
 * Callers that intend to mutate must capture an
 * `ExpectedVersion<ExportJob>` token via `findById` first — the
 * `findByOwner` / `findExpired` listings are read-only and do not
 * declare write intent.
 */
export interface ExportJobRepository
  extends TransactionalRepository<ExportJob> {
  /**
   * Most-recent-first listing of jobs owned by `ownerId`. Used by the
   * "my exports" UI; status filtering / counting belongs to a
   * dedicated read-model and is intentionally not on this port.
   */
  findByOwner(
    ownerId: UserId,
    opts: ExportJobListOpts,
  ): Promise<readonly ExportJob[]>;

  /**
   * Returns completed jobs whose `expiresAt < now`, capped at `limit`.
   * Drives the periodic expiry batch (`PurgeExpiredExports`); the
   * matching artifact deletion is the storage adapter's job and is
   * orchestrated outside this repository.
   */
  findExpired(now: Date, limit: number): Promise<readonly ExportJob[]>;
}

/**
 * Reference-type alias kept for parity with other aggregates in this
 * codebase that re-export their id from the port module for adapter
 * convenience.
 */
export type { ExportJobId };
