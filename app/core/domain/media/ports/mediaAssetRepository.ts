import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAsset } from "../entity";
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
  findOrphansOlderThan(
    before: Date,
    limit: number,
  ): Promise<readonly MediaAsset[]>;
  save(asset: MediaAsset): Promise<void>;
  delete(id: MediaAssetId): Promise<void>;
}
