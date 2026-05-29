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
 * Owner-scope count options. Filter semantics mirror
 * `NoteOwnerListOpts`; pagination and sort fields are intentionally
 * omitted since they have no meaning for a count.
 *
 * Derived via `Pick` from `NoteOwnerListOpts` so the two cannot drift —
 * any new filter on the list side is automatically reflected on the
 * count side via the picked key set.
 */
export type NoteOwnerCountOpts = Pick<
  NoteOwnerListOpts,
  "status" | "tagIds" | "dateRange" | "visibility" | "referencingNoteId"
>;

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
  /**
   * Lookup by `(ownerId, slug)`. Returns `null` when no match. Returns
   * active notes only; trashed notes are excluded. Pairs with the
   * partial unique index `uniq_notes_owner_slug WHERE status='active'`
   * so the API and the DB constraint share the same scope.
   */
  findByOwnerAndSlug(ownerId: UserId, slug: NoteSlug): Promise<Note | null>;

  /** Active notes directly under `directoryId`. */
  findByDirectory(
    directoryId: DirectoryId,
    opts: NoteListOpts,
  ): Promise<readonly Note[]>;

  /**
   * Bulk read by ids. Used by listing pipelines (notably the search
   * path) to materialise per-note fields that are not carried by
   * `SearchHit` (`directoryId` / `slug` / `updatedAt`) without
   * producing N+1 queries. Order is not guaranteed; the caller must
   * re-index by id (typically via `Map<NoteId, Note>`) when preserving
   * input order matters. Ids without a matching row are simply absent
   * from the result. An empty `ids` argument short-circuits to `[]`
   * without touching the DB.
   */
  findByIds(ids: readonly NoteId[]): Promise<readonly Note[]>;

  /** Owner-scoped listing with status / tag / date filters. */
  findByOwner(
    ownerId: UserId,
    opts: NoteOwnerListOpts,
  ): Promise<readonly Note[]>;

  /**
   * Owner-scoped active notes whose `title` matches `prefix` as a
   * case-insensitive prefix. Used by the WYSIWYG internal-link suggest
   * popup. The caller is responsible for trimming `prefix` and clamping
   * `limit` to a small constant; the adapter LIKE-escapes wildcards in
   * the user input. Ordered by title asc, id asc for stable ranking
   * across identical titles. Trashed notes are excluded.
   *
   * The adapter returns up to `limit` matches **without** semantic
   * post-filtering (e.g. excluding titles containing
   * `INTERNAL_LINK_PATTERN` boundary characters `[` / `]` / `|` for
   * round-trippable insertion — see ADR-008). Any such filtering is the
   * usecase's responsibility; the port intentionally stays neutral so
   * other callers with different filter rules can reuse the method.
   */
  searchByTitlePrefix(
    ownerId: UserId,
    prefix: string,
    limit: number,
  ): Promise<readonly Note[]>;

  /**
   * Owner-scoped active notes whose `title` equals `title` under a
   * case-insensitive exact match (`lower(title) = lower(?)`). Used to
   * resolve `kind=title` internal links (`[[title]]`) to a note id.
   *
   * Titles are not unique within an owner, so this returns **all**
   * matches ordered by title asc, id asc (mirroring
   * `searchByTitlePrefix`). Picking a single note when several match —
   * and deciding when "no match" means an unresolved link — is the
   * caller's (domain service's) responsibility; the port stays neutral
   * and does not assume the consumer's tie-break or self-exclusion
   * rules. Trashed notes are excluded.
   */
  findActiveByOwnerAndTitle(
    ownerId: UserId,
    title: string,
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

  /**
   * Total notes for `ownerId` matching the supplied filters. Filter
   * semantics mirror {@link NoteRepository.findByOwner}. When `opts` is
   * `undefined` (or an empty object — the two are equivalent) every
   * note belonging to the owner is counted (active + trashed); when
   * `opts` carries one or more filter fields, only notes that would be
   * returned by `findByOwner` with the same filters are counted.
   *
   * Used by `listNotesByOwner` to keep the rendered "total count" in
   * sync with the filtered slice so the UI does not display a total
   * that disagrees with the visible page.
   */
  countByOwner(ownerId: UserId, opts?: NoteOwnerCountOpts): Promise<number>;

  /**
   * Owner-scoped batch listing that returns the page `items` and the
   * filtered total `count` from a single filter resolution. Together
   * with {@link NoteRepository.findByOwner} and
   * {@link NoteRepository.countByOwner}, this method is the third
   * sibling of an API family that shares one filter contract; adapters
   * resolve the filter exactly once and derive both projections from
   * the same intermediate. Semantically:
   *
   *   listWithCount(ownerId, opts).items === findByOwner(ownerId, opts)
   *   listWithCount(ownerId, opts).count === countByOwner(ownerId, opts')
   *
   * where `opts'` is `opts` with the pagination / sort fields dropped
   * (those have no meaning for a count). The `opts === undefined`
   * convenience overload of `countByOwner` corresponds to
   * `listWithCount` invoked with all filter fields left unset.
   *
   * Contract:
   * - `count` is the filtered total **before** pagination — i.e.
   *   `opts.limit` / `opts.offset` / `opts.sort` / `opts.order` only
   *   affect the `items` projection. `count` is the cardinality of the
   *   full filtered set and is independent of the page window.
   * - Filter semantics (status / tagIds / dateRange / visibility /
   *   referencingNoteId) mirror {@link NoteRepository.findByOwner};
   *   pagination / sort fields mirror {@link NoteListOpts}.
   * - When the filter combination cannot match any owner-scoped note
   *   (an empty `visibility` array, or filters that intersect to the
   *   empty set), adapters short-circuit to `{ items: [], count: 0 }`
   *   without touching the database.
   * - Because both projections are derived from the same filter
   *   resolution, `items.length <= count` and the rendered total cannot
   *   structurally disagree with the visible slice (Issue #30 invariant
   *   stays enforced — see `listNotesByOwner` for the consumer).
   *
   * PR #170 ADR-001 Follow-up [P-W-004]: previously `findByOwner` +
   * `countByOwner` ran the filter-resolution pipeline twice. This
   * batch entry point lets the adapter collapse them to a single pass.
   * The single-call siblings stay available for callers that only
   * need one projection.
   */
  listWithCount(
    ownerId: UserId,
    opts: NoteOwnerListOpts,
  ): Promise<{ items: readonly Note[]; count: number }>;
}
