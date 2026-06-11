import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { DateRange, NoteId } from "@/core/domain/note/valueObject";
import type { PublicationState } from "../entity";

/** Listing options for paged owner / global queries. */
export type PublicationListOpts = Readonly<{
  limit: number;
  cursor?: NoteId;
}>;

/**
 * Options for the public-by-owner listing sorted on `published_at`.
 *
 * `order` picks the publish-time direction; ties break on `note_id` so the
 * order is total and deterministic. `limit` / `offset` page the result.
 * `noteIds`, when supplied, constrains the listing to that candidate set
 * (`note_id IN (...)`) — the application layer resolves tag AND-filters to
 * ids and passes them here so the publish-time order and the filtered count
 * come from a single pass.
 *
 * `publishedRange`, when supplied, filters on the publication aggregate's
 * `published_at`: `from` maps to `gte(published_at, from)` and `to` to a
 * `lt(published_at, to)`. The range is the same `DateRange` half-open VO the
 * note-list filter uses; the P30 presentation boundary pre-normalises `to` to
 * the day-after-00:00 so the user-chosen end date is inclusive (#619 ADR-006).
 * Applied to both the page and the `total` in the same pass.
 */
export type PublicNoteSortedOpts = Readonly<{
  order: "asc" | "desc";
  limit: number;
  offset: number;
  noteIds?: readonly NoteId[];
  publishedRange?: DateRange;
}>;

/** Result of {@link PublicationStateRepository.listPublicNoteIdsByOwnerSorted}. */
export type PublicNoteSortedResult = Readonly<{
  noteIds: readonly NoteId[];
  total: number;
}>;

/**
 * Persistence port for the `PublicationState` aggregate.
 *
 * The aggregate id is `NoteId`, so OCC reads enter via `findByNoteId`.
 * `TransactionalRepository<PublicationState, NoteId>` provides the
 * usual `insert` / `findById` / `save` / `delete` contract (the
 * `findById` slot is realised as `findByNoteId` by the adapter and
 * exposed separately below for clarity of intent at the call site —
 * both must return the same `Versioned` shape so OCC tokens flow
 * through to the matching `save`).
 *
 * Read-only listing queries return plain id-shaped projections so
 * cross-aggregate joins live in the application layer (or in the
 * adapter's read-only SQL) rather than dragging Note data into the
 * publication domain.
 */
export interface PublicationStateRepository
  extends TransactionalRepository<PublicationState, NoteId> {
  /**
   * Owner-scoped enumeration of notes whose visibility is `public`.
   * Returns plain ids so the caller can join against Note projections
   * as it sees fit.
   */
  findPublicByOwner(
    ownerId: UserId,
    opts: PublicationListOpts,
  ): Promise<readonly NoteId[]>;

  /**
   * Owner-scoped public-note ids ordered by `published_at` (the publication
   * aggregate's value), with the matching `total`. Notes whose
   * `published_at` is NULL are excluded — symmetric with
   * {@link findPublicByOwner} and with the entity invariant that a `public`
   * note always carries a non-NULL `published_at`.
   *
   * Both the page and the `total` are computed over the same `active`-note
   * population (the adapter joins `notes` on `status = 'active'`), so the
   * trash → outbox-relay lag cannot inflate `total` past what the page can
   * render: `items.length <= total` holds and the window is independent of
   * the count. The optional `noteIds` candidate set (pre-resolved tag
   * AND-filter) is applied to both in the same pass.
   */
  listPublicNoteIdsByOwnerSorted(
    ownerId: UserId,
    opts: PublicNoteSortedOpts,
  ): Promise<PublicNoteSortedResult>;

  /**
   * Owner-scoped public-note ids whose `published_at` falls in
   * `publishedRange` (`from`/`to` are the same half-open `DateRange` VO the
   * note-list filter uses; `to` is exclusive). Capped at `limit` ids — the
   * caller passes the resolved set as the candidate (`note_id IN (...)`) for a
   * note-column-sorted listing so the公開日範囲 filter is honoured on a path
   * that does not otherwise read the publication aggregate (#619 ADR-005). The
   * `active`-note JOIN keeps trashed-but-still-public rows out of the set.
   */
  listPublicNoteIdsByOwnerInRange(
    ownerId: UserId,
    publishedRange: DateRange,
    limit: number,
  ): Promise<readonly NoteId[]>;

  /**
   * Global enumeration of public notes (timeline / search reindex use
   * case). Pairs each note with its owner so callers can fan out to
   * per-owner caches without an extra round-trip.
   */
  findAllPublic(
    opts: PublicationListOpts,
  ): Promise<readonly Readonly<{ ownerId: UserId; noteId: NoteId }>[]>;

  /**
   * Bulk read used by listing pipelines to avoid the N+1 that
   * `Promise.all(findById)` would produce. Order is not guaranteed.
   * Note ids without a matching row are simply absent from the result;
   * callers fall back to the domain default (`'private'`).
   * An empty `ids` argument short-circuits to `[]` without touching DB.
   */
  findByNoteIds(ids: readonly NoteId[]): Promise<readonly PublicationState[]>;
}
