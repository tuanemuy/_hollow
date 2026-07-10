import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAsset, PendingMedia } from "../entity";
import type { MediaAssetId } from "../valueObject";

/** Listing options for owner-scoped queries. */
export type MediaListOpts = Readonly<{
  limit: number;
  cursor?: MediaAssetId;
}>;

/**
 * Persistence port for the `MediaAsset` aggregate.
 *
 * Unlike most aggregates in this codebase, `MediaAsset` does not extend
 * `TransactionalRepository` and therefore does not thread
 * `ExpectedVersion` tokens. Ref-count mutations are very high-frequency
 * and would deadlock under OCC; concurrency is handled by the adapter
 * (atomic SQL counters / row-level locks) instead.
 *
 * `save` is upsert-style: it inserts on first persistence and updates in
 * place thereafter. `findById` / `findByIds` are read-only projections,
 * not OCC read-with-intent-to-write captures.
 */
export interface MediaAssetRepository {
  findById(id: MediaAssetId): Promise<MediaAsset | null>;
  findByIds(ids: readonly MediaAssetId[]): Promise<readonly MediaAsset[]>;
  findByOwner(
    ownerId: UserId,
    opts: MediaListOpts,
  ): Promise<readonly MediaAsset[]>;
  /**
   * Read-only owner-scoped aggregation of `attached` media assets: the
   * count and the sum of their `byteSize`. Only `attached` is counted —
   * `pending` / `orphan` / `deleting` are purge-lifecycle transients and
   * do not represent user-accessible media. Returns `{ count: 0,
   * totalBytes: 0 }` when the owner has no attached assets.
   *
   * Computed in a single aggregate query (no row enumeration) for
   * O(1) reads on large libraries. Used by `summarizeAccountDeletion`
   * (P24). See `.issue/573/adr.md` ADR-002.
   */
  aggregateByOwner(
    ownerId: UserId,
  ): Promise<Readonly<{ count: number; totalBytes: number }>>;
  /**
   * Purge candidates whose `updatedAt` predates `before`: `orphan` rows
   * awaiting their first purge, plus `deleting` rows whose earlier purge
   * was interrupted (e.g. a transient R2 delete failure) and must be
   * resumed. `markDeleting` re-stamps `updatedAt`, so a freshly-marked
   * row stays out of this window until the grace period lapses again.
   */
  findPurgeableOlderThan(
    before: Date,
    limit: number,
  ): Promise<readonly MediaAsset[]>;
  /**
   * Abandoned source intakes: `pending` rows with `kind = 'source'`
   * whose `updatedAt` predates `before`, ordered oldest-first
   * (`updatedAt` ascending, then `id` ascending as the tie-break).
   * The tie-break is part of the contract: rows created in the same
   * second (e.g. a failed bulk commit) share an `updatedAt`, and
   * limit-crossing sweeps stay deterministic only if every
   * implementation resolves ties the same way. These are
   * rows created by the commit flow's metadata-first stage (a) that were
   * never attached — the commit's main UoW rolled back or the `put`
   * failed — so the sweep can reclaim them. Only `kind = 'source'` is in
   * scope: pending rows of other kinds may legitimately be awaiting
   * attach from an open editor draft (#468 ADR-004).
   */
  findAbandonedSourceIntakes(
    before: Date,
    limit: number,
  ): Promise<readonly PendingMedia[]>;
  save(asset: MediaAsset): Promise<void>;
  delete(id: MediaAssetId): Promise<void>;
}
