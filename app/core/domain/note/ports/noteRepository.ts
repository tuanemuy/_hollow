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
 *
 * `directoryIds` restricts to notes whose `directoryId` is **any** of
 * the supplied ids — an `IN (...)` match. The caller resolves the
 * subtree (selected directory + every descendant) and passes the
 * flattened id set, so both this filter path and the search path agree
 * on subtree semantics (`.issue/392/adr.md` ADR-001). An empty array
 * matches nothing (the adapter short-circuits); `undefined` applies no
 * directory filter.
 */
export type NoteOwnerListOpts = NoteListOpts &
  Readonly<{
    status?: NoteStatus;
    tagIds?: readonly TagId[];
    dateRange?: DateRange;
    visibility?: readonly PublicationVisibility[];
    referencingNoteId?: NoteId;
    directoryIds?: readonly DirectoryId[];
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
  | "status"
  | "tagIds"
  | "dateRange"
  | "visibility"
  | "referencingNoteId"
  | "directoryIds"
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
   * `searchByTitlePrefix`). Unlike `searchByTitlePrefix` there is no
   * `limit`: every exact match is returned, so callers must not rely on
   * this for owners where a single title can repeat pathologically. The
   * `(ownerId, status='active')` filter keeps the candidate set small in
   * practice (see ADR-002/004 in `.issue/36/adr.md`). Picking a single
   * note when several match — and deciding when "no match" means an
   * unresolved link — is the caller's (domain service's) responsibility;
   * the port stays neutral and does not assume the consumer's tie-break
   * or self-exclusion rules. Trashed notes are excluded.
   *
   * `title` is matched verbatim (case-folded); the caller is responsible
   * for trimming it — a value with leading/trailing whitespace will not
   * match a stored title. In practice both `InternalLinkRef.target` and
   * `NoteTitle` are already trimmed value objects, so the round-trip holds.
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
   *
   * When `opts` is omitted every referrer is returned ordered by
   * `updatedAt DESC, id DESC` (the export / backlinks-export paths rely
   * on the full id set, so this back-compat full-fetch is preserved).
   * When `opts` is supplied the result is a bounded slice honouring
   * `limit` / `offset` / `sort` / `order`; `sort` defaults to
   * `updatedAt` and `order` to `desc`. The tie-break is always `id DESC`
   * regardless of `order` (same as `findByOwner`), so equal-key rows at
   * a page boundary order deterministically. Referrers are effectively
   * owner-scoped (internal links only resolve within an owner), so a
   * caller that needs the *total* referrer count alongside a bounded
   * preview pairs this with
   * `countByOwner(ownerId, { referencingNoteId: targetNoteId })`.
   */
  findReferrers(
    targetNoteId: NoteId,
    opts?: NoteListOpts,
  ): Promise<readonly Note[]>;

  /**
   * Owner-scoped unresolved `kind=title` link rows whose `refTarget`
   * equals `title` case-insensitively. A row qualifies when
   * `refKind='title'` AND `resolvedNoteId IS NULL` AND
   * `lower(refTarget) = lower(title)` AND its `fromNoteId` points at an
   * **active** note owned by `ownerId`. Used by the link-target
   * resolution reaction handler (Issue #321) to backfill links that
   * point at a note which has just been created / renamed / restored.
   *
   * `note_internal_links` carries no owner column, so the adapter joins
   * onto `notes` (fromNoteId, status='active', ownerId) to scope the
   * result. The `lower()` comparison cannot use `idx_nil_target`
   * (which only covers `refKind` prefix); it degrades to a filter — the
   * `(ownerId, status='active')` join keeps the candidate set small in
   * practice (see #127 ADR-002).
   *
   * Returns only the data the caller needs to re-decide resolution: the
   * link row `id` (for `setLinkResolution`) and its `fromNoteId` (for
   * self-exclusion via the decision rule). Picking a single winning note
   * among duplicate titles is the caller's (domain service's)
   * responsibility — the port stays neutral.
   */
  findUnresolvedTitleLinkRows(
    ownerId: UserId,
    title: string,
  ): Promise<readonly { id: string; fromNoteId: NoteId }[]>;

  /**
   * Owner-scoped unresolved `kind=id` link rows whose `refTarget` equals
   * `targetNoteId`. A row qualifies when `refKind='id'` AND
   * `resolvedNoteId IS NULL` AND `refTarget = targetNoteId` AND its
   * `fromNoteId` points at an **active** note owned by `ownerId` that is
   * not `targetNoteId` itself (self links never resolve — ADR-005).
   * Used by the resolution reaction handler to backfill `[[<uuid>]]`
   * links after the target note is created / restored (Issue #321).
   *
   * The id mirror of `findUnresolvedTitleLinkRows`: `findResolvedLinkRowsByTarget`
   * only surfaces rows that are already resolved to the target, so it
   * cannot find the unresolved id rows this method targets. Like the
   * title variant the adapter joins onto `notes` for the owner / active
   * scope (no owner column on the link table).
   */
  findUnresolvedIdLinkRows(
    ownerId: UserId,
    targetNoteId: NoteId,
  ): Promise<readonly { id: string; fromNoteId: NoteId }[]>;

  /**
   * Link rows whose `resolvedNoteId` equals `targetNoteId`, regardless
   * of `refKind`. Shares the `idx_nil_resolved`-backed `where` of
   * {@link NoteRepository.findReferrers}, but returns the raw link-row
   * shape (`id` / `fromNoteId` / `refKind` / `refTarget`) rather than
   * hydrated notes. Used by the resolution reaction handlers (Issue
   * #321) to find the rows that must be **unresolved** when the target
   * is renamed (stale `kind=title` rows whose `refTarget` no longer
   * matches the current title) or trashed (every row, since the FK
   * `set null` fires only on physical delete).
   */
  findResolvedLinkRowsByTarget(targetNoteId: NoteId): Promise<
    readonly {
      id: string;
      fromNoteId: NoteId;
      refKind: "id" | "title";
      refTarget: string;
    }[]
  >;

  /**
   * Set (or clear, when `resolvedNoteId === null`) the `resolved_note_id`
   * column on the link rows identified by `linkRowIds`. An empty
   * `linkRowIds` short-circuits without touching the DB.
   *
   * `resolved_note_id` is a projection derived from the body's
   * `internalLinkRefs`, not part of the referencing note's aggregate
   * invariants, so it is updated row-wise outside the aggregate boundary
   * (Issue #321 ADR-008). The write is buffered onto the surrounding
   * UoW's pending batch like the aggregate child writes — callers must
   * order their reads before this call so the deferred flush does not
   * depend on its own write (D1 has no read-your-write within a UoW).
   * The adapter chunks the `IN (...)` predicate under the D1 host-var
   * cap.
   */
  setLinkResolution(
    linkRowIds: readonly string[],
    resolvedNoteId: NoteId | null,
  ): Promise<void>;

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
