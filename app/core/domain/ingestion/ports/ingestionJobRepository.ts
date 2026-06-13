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
 *
 * `excludeStatuses` lets the caller declaratively hide rows in the given
 * status set (e.g. the upload-queue view hides `discarded` by default).
 *
 * Contract for combining `status` (include) and `excludeStatuses`:
 * - If `status` is provided, it takes precedence and `excludeStatuses`
 *   is ignored — adapters MUST NOT emit a `NOT IN (...)` clause in that
 *   case. The intent is that an explicit include is more specific than
 *   a default exclude, so callers can use `status: "discarded"` to fetch
 *   a discarded-only history view even while the default excludes
 *   `discarded` elsewhere.
 * - If `status` is omitted and `excludeStatuses` is a non-empty array,
 *   rows whose `status` is in the array are filtered out.
 * - If both are omitted (or `excludeStatuses` is empty), no status
 *   filtering is applied.
 */
/**
 * Counting options for owner-scoped status counts. See
 * {@link IngestionJobRepository.countByOwner} for the contract, including
 * why this speaks a multi-include `statuses` while the listing opts speak
 * `status` / `excludeStatuses`.
 */
export type IngestionJobCountOpts = Readonly<{
  statuses: readonly IngestionStatus[];
}>;

export type IngestionJobListOpts = Readonly<{
  limit: number;
  offset: number;
  status?: IngestionStatus;
  excludeStatuses?: readonly IngestionStatus[];
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
 * - `countByOwner` for the header queue badge.
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
   * Read-only count of jobs owned by `ownerId` whose `status` is in
   * `statuses`. Used by the header queue badge (`countActiveIngestionJobs`)
   * so the caller never has to materialise the rows just to count them.
   *
   * Not a write-intent surface: callers that intend to mutate must still
   * go through `findById` to capture an `ExpectedVersion`.
   *
   * Vocabulary note: `findByOwner`'s opts speak `status` (single include)
   * + `excludeStatuses` (multi exclude) because listing defaults to
   * "everything except discarded". Counting has the opposite shape — its
   * sole use is "how many rows are in this status set", so a multi-include
   * `statuses` (one `IN (...)` filter) is the natural contract here.
   *
   * An empty `statuses` array means an empty status set and MUST resolve
   * to 0 without touching the database.
   */
  countByOwner(ownerId: UserId, opts: IngestionJobCountOpts): Promise<number>;

  /**
   * Admin-only read-only listing across all owners, most-recent-first.
   * Used by `/admin/jobs` to surface failing / in-flight ingestion jobs
   * across the instance. The caller's admin guard runs at the page /
   * usecase boundary — the port itself is unauthenticated.
   *
   * Not a write-intent surface: callers that intend to mutate must still
   * go through `findById` to capture an `ExpectedVersion`.
   *
   * Callers must clamp `limit` to a reasonable bound — there is no upper
   * limit enforced by the port. Current call sites use a fixed value.
   *
   * OFFSET-based pagination is acceptable at small page depths; if deep
   * pagination is needed, switch to keyset (seek) pagination on
   * `(updated_at, id)`.
   */
  findRecent(opts: {
    limit: number;
    offset?: number;
  }): Promise<readonly IngestionJob[]>;

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
