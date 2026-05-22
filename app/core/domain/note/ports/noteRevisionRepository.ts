import type { NoteRevision } from "../revision";
import type { NoteId, NoteRevisionId } from "../valueObject";

/**
 * Read / write contract for `NoteRevision` rows.
 *
 * Revisions are append-only and immutable, so this port intentionally
 * does **not** extend `TransactionalRepository<NoteRevision>`: there is
 * no OCC token (each row is rewritten via INSERT / pruned via DELETE),
 * no `save`, no `delete(id)`. Pruning enforces the per-note retention
 * ceiling described by `AdminSettings.limits.maxNoteRevisionsPerNote`.
 *
 * Lifetime semantics:
 * - INSERT happens inside the same UoW as the `SaveNote` /
 *   `RestoreNoteRevision` write that motivated it.
 * - `deleteOldestForNote` is called from the same UoW when an insertion
 *   would push the row count above the configured limit.
 * - Rows are CASCADE-deleted when the parent `Note` is physically
 *   purged (FK `ON DELETE CASCADE` on `notes(id)`).
 *
 * Ordering: callers expect "newest first" (`created_at DESC, id DESC`)
 * for the list endpoint. UUIDv7 ids carry monotonic time so the
 * secondary `id DESC` tie-break keeps the ordering stable when two
 * revisions land within the same millisecond.
 */
export interface NoteRevisionRepository {
  /** Lookup a single revision by id. Returns `null` when no match. */
  findById(id: NoteRevisionId): Promise<NoteRevision | null>;

  /**
   * Newest-first listing of revisions for `noteId`. The caller is
   * responsible for applying the per-note authorisation check before
   * calling this (the port itself does not consult `notes.owner_id`).
   */
  findByNoteId(
    noteId: NoteId,
    opts: Readonly<{ limit: number; offset: number }>,
  ): Promise<readonly NoteRevision[]>;

  /** Total revisions stored for `noteId`. Used for paging + retention. */
  countByNoteId(noteId: NoteId): Promise<number>;

  /** Append a single revision. Fails the surrounding UoW on conflict. */
  insert(revision: NoteRevision): Promise<void>;

  /**
   * Trim the oldest revisions for `noteId` so the surviving row count
   * is at most `keepCount`. Returns the number of rows actually deleted
   * — callers may use it for diagnostics but otherwise ignore the value.
   * Idempotent: if the stored count is already at-or-below `keepCount`,
   * the call is a no-op and returns `0`.
   *
   * `keepCount` is a non-negative integer; passing `0` is legal and
   * means "delete every revision for this note". This case arises in
   * practice when an operator sets `maxNoteRevisionsPerNote = 1`
   * because the pruner is called with `cap - 1` to account for the
   * pending insert in the same UoW batch.
   */
  deleteOldestForNote(noteId: NoteId, keepCount: number): Promise<number>;
}
