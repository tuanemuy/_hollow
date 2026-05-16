import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { IngestionJob } from "../entity";
import type { IngestionJobId, IngestionStatus } from "../valueObject";

/**
 * Listing options for owner-scoped queries.
 *
 * Offset/limit-style; ingestion lists are bounded per user. Filtering by
 * `status` is offered as the most common surface — searching by kind /
 * date range is handled in the application layer if needed.
 */
export type IngestionJobListOpts = Readonly<{
  limit: number;
  offset: number;
  status?: IngestionStatus;
  order?: "asc" | "desc";
}>;

/**
 * Persistence port for the `IngestionJob` aggregate.
 *
 * Inherits the OCC-enforced contract (`insert` / `findById` / `save` /
 * `delete`) from `TransactionalRepository<IngestionJob>` and adds the
 * read-only listings that ingestion usecases need:
 *
 * - `findByOwner` for the per-user job dashboard.
 * - `findStuck` for the recovery worker that ages-out processing-stuck
 *   jobs into `failed` so the operator can decide whether to retry.
 *
 * `findByOwner` / `findStuck` do not declare write intent — callers
 * that intend to mutate must still go through `findById` to capture an
 * `ExpectedVersion<IngestionJob>` token.
 */
export interface IngestionJobRepository
  extends TransactionalRepository<IngestionJob, IngestionJobId> {
  findByOwner(
    ownerId: UserId,
    opts: IngestionJobListOpts,
  ): Promise<readonly IngestionJob[]>;

  /**
   * Returns jobs that have been in `processing` since before `threshold`.
   * Used by the recovery worker to surface stuck jobs.
   */
  findStuck(threshold: Date): Promise<readonly IngestionJob[]>;

  /**
   * Sum of `byteSize` across jobs owned by `ownerId` whose `createdAt`
   * is on or after `since`. Used by `UploadFile` to enforce
   * `InstanceLimits.maxUploadBytesPerDay`. Discarded / failed rows count
   * towards the quota because the upload bandwidth has already been
   * consumed; only the post-commit aggregate matters.
   */
  sumByteSizeByOwnerSince(ownerId: UserId, since: Date): Promise<number>;
}
