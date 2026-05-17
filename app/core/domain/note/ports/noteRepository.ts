import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import type { Note } from "../entity";
import type { DateRange, NoteId, NoteSlug, NoteStatus } from "../valueObject";

/**
 * Read-only listing options shared across note queries. Listing is
 * offset/limit-style; cursor pagination is layered on top of this in the
 * search domain where it matters.
 */
export type NoteListOpts = Readonly<{
  limit: number;
  offset: number;
  sort?: "updatedAt" | "createdAt" | "title";
  order?: "asc" | "desc";
}>;

/**
 * Extended owner-scope listing options. Filters are combined with `AND`
 * semantics on the adapter side; `tagIds` matches notes that carry
 * every supplied tag.
 *
 * `visibility` semantics:
 * - `undefined` — visibility filter is not applied.
 * - Non-empty array — IN semantics: a note matches when its publication
 *   visibility is in the supplied set. Notes without a `publication_states`
 *   row are treated as `'private'` (the domain default), so passing
 *   `['private']` includes them.
 * - Empty array `[]` — "match nothing": the adapter returns `[]` without
 *   touching `publication_states`. This keeps "no filter" (`undefined`)
 *   and "all-excluded" (`[]`) distinguishable at the type level.
 *
 * `referencingNoteId` restricts to notes that link to the target note
 * (i.e. rows in `noteInternalLinks` with `resolvedNoteId === id`).
 * Unresolved `[[title]]` links do not count.
 */
export type NoteOwnerListOpts = NoteListOpts &
  Readonly<{
    status?: NoteStatus;
    tagIds?: readonly TagId[];
    dateRange?: DateRange;
    visibility?: readonly PublicationVisibility[];
    referencingNoteId?: NoteId;
  }>;

/**
 * `NoteRepository` inherits the OCC-enforced contract
 * (`insert` / `findById` / `save` / `delete`) from
 * `TransactionalRepository<Note>` and adds the read-only queries that
 * note usecases and the directory subtree-delete flow rely on.
 *
 * `trashByDirectory` is a bulk operation invoked by
 * `DirectoryService.deleteSubtree`. It transitions every active note in
 * the given directory to `trashed` and returns the affected ids so the
 * caller can emit the matching `note.trashed` outbox events. The
 * implementation is responsible for keeping each row's version monotonic.
 *
 * `purge` is the physical delete path used after retention has elapsed
 * and emits `note.purged` for downstream media ref-count cleanup.
 *
 * `RepositoryConflictError` is raised by the slug-unique constraint
 * during `insert` / `save` when the persistence layer detects a race
 * around `(ownerId, slug)`.
 */
export interface NoteRepository extends TransactionalRepository<Note> {
  /** Lookup by `(ownerId, slug)`. Returns `null` when no match. */
  findByOwnerAndSlug(ownerId: UserId, slug: NoteSlug): Promise<Note | null>;

  /** Active notes directly under `directoryId`. */
  findByDirectory(
    directoryId: DirectoryId,
    opts: NoteListOpts,
  ): Promise<readonly Note[]>;

  /** Owner-scoped listing with status / tag / date filters. */
  findByOwner(
    ownerId: UserId,
    opts: NoteOwnerListOpts,
  ): Promise<readonly Note[]>;

  /** Trashed notes older than `before`. Used by the purge worker. */
  findTrashedOlderThan(ownerId: UserId, before: Date): Promise<readonly Note[]>;

  /**
   * Notes that link to `targetNoteId` via `internalLinkRefs`. The
   * adapter joins on `resolvedNoteId === targetNoteId`. Used to render
   * backlinks.
   */
  findReferrers(targetNoteId: NoteId): Promise<readonly Note[]>;

  /**
   * Bulk-trash every active note under `directoryId`. Returns the ids of
   * notes that were actually transitioned. Implementations must skip
   * already-trashed rows so the operation is idempotent.
   */
  trashByDirectory(directoryId: DirectoryId): Promise<readonly NoteId[]>;

  /**
   * Physical delete. Used after a note has been trashed and the
   * retention window has passed. Outbox events for media ref-count
   * cleanup are the caller's responsibility.
   */
  purge(id: NoteId): Promise<void>;

  /** Total notes for `ownerId` (active + trashed). */
  countByOwner(ownerId: UserId): Promise<number>;
}
