import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationState } from "../entity";

/** Listing options for paged owner / global queries. */
export type PublicationListOpts = Readonly<{
  limit: number;
  cursor?: NoteId;
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
   * Global enumeration of public notes (timeline / search reindex use
   * case). Pairs each note with its owner so callers can fan out to
   * per-owner caches without an extra round-trip.
   */
  findAllPublic(
    opts: PublicationListOpts,
  ): Promise<readonly Readonly<{ ownerId: UserId; noteId: NoteId }>[]>;
}
