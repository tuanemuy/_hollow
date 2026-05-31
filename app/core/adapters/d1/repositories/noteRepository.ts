import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notExists,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  ConflictError,
  SystemError,
  SystemErrorCode,
} from "@/core/application/errors";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Note } from "@/core/domain/note/entity";
import type {
  NoteListOpts,
  NoteOwnerCountOpts,
  NoteOwnerListOpts,
  NoteRepository,
} from "@/core/domain/note/ports/noteRepository";
import type {
  FrontMatterRecord,
  NoteId,
  NoteSlug,
} from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import {
  noteInternalLinks,
  noteMediaRefs,
  notes,
  noteTags,
  publicationStates,
} from "../schema";
import { SAFE_CHUNK_SIZE, selectInChunks } from "./_chunks";
import { escapeLikePattern, mapDbError } from "./helpers";

type NoteRow = typeof notes.$inferSelect;
type NoteTagRow = typeof noteTags.$inferSelect;
type NoteInternalLinkRow = typeof noteInternalLinks.$inferSelect;
type NoteMediaRefRow = typeof noteMediaRefs.$inferSelect;

type SortColumn = Extract<keyof NoteRow, "updatedAt" | "createdAt" | "title">;

// Aggregate-shaped bundle of the per-note ancillary rows the reconstruct
// path consumes. Built once per multi-row read and indexed by note id so
// the row → Note mapping is O(1).
type ChildSets = Readonly<{
  tagIds: Map<string, string[]>;
  internalLinks: Map<string, NoteInternalLinkRow[]>;
  mediaIds: Map<string, string[]>;
}>;

/**
 * D1 implementation of `NoteRepository`.
 *
 * The Note aggregate spans four tables (`notes` + `note_tags` +
 * `note_internal_links` + `note_media_refs`). Reads execute as a fixed
 * sequence of queries against the binding (no transaction); the rows
 * are then folded into `Note` aggregates via `Note.reconstruct`.
 * Writes register Drizzle query expressions on the supplied
 * `PendingBatch` so the surrounding `D1UnitOfWorkProvider` flushes them
 * atomically via `db.batch()`.
 *
 * The aggregate's child rows (`note_tags` / `note_internal_links` /
 * `note_media_refs`) are persisted via delete-and-reinsert on every
 * `save`/`insert`. The Note aggregate carries a complete materialised
 * view of its children, so reconciliation by diff would not buy
 * anything beyond extra adapter complexity — the OCC token guarantees
 * the old children belong to the version we just bumped past.
 *
 * OCC is enforced by the `ExpectedVersion<Note>` token returned from
 * `findById`. This file is the only legitimate construction site of the
 * token (via the `as` cast inside `toVersioned`).
 */
export class D1NoteRepository implements NoteRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  // ---------------------------------------------------------------------
  // Rehydration helpers
  // ---------------------------------------------------------------------

  private parseTimestamp(value: string, field: string, noteId: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored note ${noteId} has malformed ${field}: ${value}`,
      );
    }
    return parsed;
  }

  private parseFrontMatter(value: string, noteId: string): FrontMatterRecord {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (cause) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored note ${noteId} has malformed front_matter_json`,
        cause,
      );
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored note ${noteId} front_matter_json is not an object`,
      );
    }
    return parsed as FrontMatterRecord;
  }

  private toNote(row: NoteRow, children: ChildSets): Note {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored note has malformed id: ${row.id}`,
      );
    }

    const editLock = (() => {
      const hasUser = row.editLockUserId !== null;
      const hasAcquired = row.editLockAcquiredAt !== null;
      const hasExpires = row.editLockExpiresAt !== null;
      if (!hasUser && !hasAcquired && !hasExpires) return null;
      if (!hasUser || !hasAcquired || !hasExpires) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored note ${row.id} has partially populated edit lock columns`,
        );
      }
      return {
        userId: row.editLockUserId as string,
        acquiredAt: this.parseTimestamp(
          row.editLockAcquiredAt as string,
          "edit_lock_acquired_at",
          row.id,
        ),
        expiresAt: this.parseTimestamp(
          row.editLockExpiresAt as string,
          "edit_lock_expires_at",
          row.id,
        ),
      };
    })();

    const tagIds = children.tagIds.get(row.id) ?? [];
    const internalLinkRows = children.internalLinks.get(row.id) ?? [];
    const mediaIds = children.mediaIds.get(row.id) ?? [];

    try {
      return Note.reconstruct({
        id: row.id,
        ownerId: row.ownerId,
        directoryId: row.directoryId,
        slug: row.slug,
        title: row.title,
        contentHtml: row.contentHtml,
        frontMatter: this.parseFrontMatter(row.frontMatterJson, row.id),
        tagIds,
        internalLinkRefs: internalLinkRows.map((link) => ({
          kind: link.refKind,
          target: link.refTarget,
          resolvedNoteId: link.resolvedNoteId,
          displayText: link.displayText,
        })),
        mediaRefs: mediaIds,
        status: row.status,
        trashedAt:
          row.trashedAt === null
            ? null
            : this.parseTimestamp(row.trashedAt, "trashed_at", row.id),
        editLock,
        version: row.version,
        createdAt: this.parseTimestamp(row.createdAt, "created_at", row.id),
        updatedAt: this.parseTimestamp(row.updatedAt, "updated_at", row.id),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored note ${row.id} violates invariants`,
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: NoteRow, children: ChildSets): Versioned<Note> {
    return {
      entity: this.toNote(row, children),
      expectedVersion: row.version as ExpectedVersion<Note>,
    };
  }

  private async loadChildren(noteIds: readonly string[]): Promise<ChildSets> {
    const empty: ChildSets = {
      tagIds: new Map(),
      internalLinks: new Map(),
      mediaIds: new Map(),
    };
    if (noteIds.length === 0) return empty;

    // Each child-table fetch is chunked under the D1 host-var cap;
    // the three tables remain fetched in parallel so the typical
    // listing's I/O latency is unchanged for sub-cap id lists.
    const [tagRows, linkRows, mediaRows] = await Promise.all([
      selectInChunks(noteIds, (chunk) =>
        this.db
          .select()
          .from(noteTags)
          .where(inArray(noteTags.noteId, [...chunk])),
      ),
      selectInChunks(noteIds, (chunk) =>
        this.db
          .select()
          .from(noteInternalLinks)
          .where(inArray(noteInternalLinks.fromNoteId, [...chunk])),
      ),
      selectInChunks(noteIds, (chunk) =>
        this.db
          .select()
          .from(noteMediaRefs)
          .where(inArray(noteMediaRefs.noteId, [...chunk])),
      ),
    ]);

    const tagIds = new Map<string, string[]>();
    for (const row of tagRows as NoteTagRow[]) {
      const arr = tagIds.get(row.noteId) ?? [];
      arr.push(row.tagId);
      tagIds.set(row.noteId, arr);
    }

    const internalLinks = new Map<string, NoteInternalLinkRow[]>();
    for (const row of linkRows as NoteInternalLinkRow[]) {
      const arr = internalLinks.get(row.fromNoteId) ?? [];
      arr.push(row);
      internalLinks.set(row.fromNoteId, arr);
    }

    const mediaIds = new Map<string, string[]>();
    for (const row of mediaRows as NoteMediaRefRow[]) {
      const arr = mediaIds.get(row.noteId) ?? [];
      arr.push(row.mediaId);
      mediaIds.set(row.noteId, arr);
    }

    return { tagIds, internalLinks, mediaIds };
  }

  private async hydrateMany(
    rows: readonly NoteRow[],
  ): Promise<readonly Note[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const children = await this.loadChildren(ids);
    return rows.map((row) => this.toNote(row, children));
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  findById(id: string): Promise<Versioned<Note> | null> {
    return mapDbError("Failed to find note", async () => {
      const rows = await this.db
        .select()
        .from(notes)
        .where(eq(notes.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const children = await this.loadChildren([row.id]);
      return this.toVersioned(row, children);
    });
  }

  findByIds(ids: readonly NoteId[]): Promise<readonly Note[]> {
    return mapDbError("Failed to find notes by ids", async () => {
      if (ids.length === 0) return [];
      const rows = await selectInChunks(ids, (chunk) =>
        this.db
          .select()
          .from(notes)
          .where(inArray(notes.id, [...chunk])),
      );
      return this.hydrateMany(rows);
    });
  }

  findByOwnerAndSlug(ownerId: UserId, slug: NoteSlug): Promise<Note | null> {
    return mapDbError("Failed to find note by owner/slug", async () => {
      const rows = await this.db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.ownerId, ownerId),
            eq(notes.slug, slug),
            eq(notes.status, "active"),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const children = await this.loadChildren([row.id]);
      return this.toNote(row, children);
    });
  }

  searchByTitlePrefix(
    ownerId: UserId,
    prefix: string,
    limit: number,
  ): Promise<readonly Note[]> {
    return mapDbError("Failed to search notes by title prefix", async () => {
      if (limit <= 0) return [];
      const trimmed = prefix.trim();
      if (trimmed.length === 0) return [];
      const pattern = `${escapeLikePattern(trimmed.toLowerCase())}%`;
      const rows = await this.db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.ownerId, ownerId),
            eq(notes.status, "active"),
            sql`lower(${notes.title}) LIKE ${pattern} ESCAPE '\\'`,
          ),
        )
        .orderBy(asc(notes.title), asc(notes.id))
        .limit(limit);
      return this.hydrateMany(rows);
    });
  }

  findActiveByOwnerAndTitle(
    ownerId: UserId,
    title: string,
  ): Promise<readonly Note[]> {
    return mapDbError("Failed to find notes by owner/title", async () => {
      const rows = await this.db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.ownerId, ownerId),
            eq(notes.status, "active"),
            sql`lower(${notes.title}) = lower(${title})`,
          ),
        )
        .orderBy(asc(notes.title), asc(notes.id));
      return this.hydrateMany(rows);
    });
  }

  findByDirectory(
    directoryId: DirectoryId,
    opts: NoteListOpts,
  ): Promise<readonly Note[]> {
    return mapDbError("Failed to list notes by directory", async () => {
      const sortCol = pickSortColumn(opts.sort);
      const order = opts.order ?? "desc";
      const rows = await this.db
        .select()
        .from(notes)
        .where(
          and(eq(notes.directoryId, directoryId), eq(notes.status, "active")),
        )
        .orderBy(
          order === "asc" ? asc(notes[sortCol]) : desc(notes[sortCol]),
          desc(notes.id),
        )
        .limit(opts.limit)
        .offset(opts.offset);
      return this.hydrateMany(rows);
    });
  }

  findByOwner(
    ownerId: UserId,
    opts: NoteOwnerListOpts,
  ): Promise<readonly Note[]> {
    return mapDbError("Failed to list notes by owner", async () => {
      const sortCol = pickSortColumn(opts.sort);
      const order = opts.order ?? "desc";

      const built = await this.buildOwnerListWhere(ownerId, opts);
      if (built === null) return [];
      const { where, idScope } = built;

      // `idScope === null` keeps the single-query path: the DB executes
      // ORDER BY / LIMIT / OFFSET in one round trip. When `idScope` is
      // present the filter chain depends on `notes.id IN (...)`, which
      // would blow past the D1 host-var cap once `idScope.size > ~90`,
      // so we chunk the lookup and re-apply sort/slice in JS.
      if (idScope === null) {
        const rows = await this.db
          .select()
          .from(notes)
          .where(where)
          .orderBy(
            order === "asc" ? asc(notes[sortCol]) : desc(notes[sortCol]),
            desc(notes.id),
          )
          .limit(opts.limit)
          .offset(opts.offset);
        return this.hydrateMany(rows);
      }

      // 2-pass chunk path (Issue #171): Pass 1 reads only the
      // sort-key columns (`id + updatedAt + createdAt + title`,
      // ~150 bytes/row) across the full `idScope`, JS-sorts and
      // slices to confirm the page id set; Pass 2 fetches the full
      // `NoteRow` (including `contentHtml` / `frontMatterJson`)
      // only for the at-most-`limit` page ids. This caps the heavy
      // materialisation at `limit × NoteRow` instead of the prior
      // `idScope.size × NoteRow` — critical because `contentHtml`
      // reaches 10-50KB/row in production. The `where` predicate is
      // applied in Pass 1 only: Pass 2 just IN-filters on the
      // already-narrowed `pageIds` (see `.issue/171/adr.md`
      // ADR-001 §補足 for the safety argument).
      const sortRows = await selectInChunks(Array.from(idScope), (chunk) =>
        this.db
          .select({
            id: notes.id,
            updatedAt: notes.updatedAt,
            createdAt: notes.createdAt,
            title: notes.title,
          })
          .from(notes)
          .where(and(where, inArray(notes.id, [...chunk]))),
      );
      const pageKeys = sortNoteRowsBy(sortRows, sortCol, order).slice(
        opts.offset,
        opts.offset + opts.limit,
      );
      if (pageKeys.length === 0) return [];
      const pageIds = pageKeys.map((r) => r.id);

      const fullRows = await selectInChunks(pageIds, (chunk) =>
        this.db
          .select()
          .from(notes)
          .where(inArray(notes.id, [...chunk])),
      );
      // Pass 2 chunks run in parallel and lose Pass 1's order.
      // Reindex by id and walk `pageIds` to rebuild the page's
      // ordering. A row missing from `byId` means it was deleted
      // between the two passes — the same race the pre-2-pass chunk
      // path and the `idScope === null` DB-side LIMIT/OFFSET path
      // both already had, surfacing here as a page shorter than
      // `limit`.
      const byId = new Map<string, NoteRow>();
      for (const row of fullRows) byId.set(row.id, row);
      const ordered: NoteRow[] = [];
      for (const id of pageIds) {
        const row = byId.get(id);
        if (row !== undefined) ordered.push(row);
      }
      return this.hydrateMany(ordered);
    });
  }

  listWithCount(
    ownerId: UserId,
    opts: NoteOwnerListOpts,
  ): Promise<{ items: readonly Note[]; count: number }> {
    return mapDbError("Failed to list notes with count by owner", async () => {
      const sortCol = pickSortColumn(opts.sort);
      const order = opts.order ?? "desc";

      // Single filter resolution shared by both projections. The
      // candidate-set fetches (`resolveVisibilityCandidateIds`,
      // `resolveTagAndCandidates`, `resolveReferrerCandidates`) and the
      // `intersectIdSets` pass run exactly once — the prior
      // `findByOwner` + `countByOwner` pair ran them twice. See
      // `.issue/173/adr.md` ADR-001.
      const built = await this.buildOwnerListWhere(ownerId, opts);
      if (built === null) return { items: [], count: 0 };
      const { where, idScope } = built;

      if (idScope === null) {
        // Reads against the binding do not share an in-flight
        // transaction, so the page-row select and the `count()`
        // aggregate are safe to fire concurrently. See `loadChildren`
        // (above) for the same pattern.
        const [rows, countRows] = await Promise.all([
          this.db
            .select()
            .from(notes)
            .where(where)
            .orderBy(
              order === "asc" ? asc(notes[sortCol]) : desc(notes[sortCol]),
              desc(notes.id),
            )
            .limit(opts.limit)
            .offset(opts.offset),
          this.db.select({ c: count() }).from(notes).where(where),
        ]);
        const items = await this.hydrateMany(rows);
        return { items, count: countRows[0]?.c ?? 0 };
      }

      // Chunk path: the full filtered id set has to be materialised to
      // run the cross-chunk JS sort anyway, so `count` is just
      // `sorted.length` — no extra per-chunk `count()` round trips.
      const rows = await selectInChunks(Array.from(idScope), (chunk) =>
        this.db
          .select()
          .from(notes)
          .where(and(where, inArray(notes.id, [...chunk]))),
      );
      const sorted = sortNoteRowsBy(rows, sortCol, order);
      const page = sorted.slice(opts.offset, opts.offset + opts.limit);
      const items = await this.hydrateMany(page);
      // `sorted` only contains rows that passed the full `where`
      // (per-chunk query applies it via `and(where, inArray(...))`), so
      // `sorted.length` equals the filtered total — not `idScope.size`,
      // which omits `where` predicates outside the candidate sets
      // (status / dateRange / visibility NOT EXISTS). See
      // `.issue/165/adr.md` ADR-001 §補足.
      return { items, count: sorted.length };
    });
  }

  // Filter-only where-builder shared by `findByOwner` and `countByOwner`
  // so the two cannot drift in filter semantics. Returns `null` when the
  // filter mix is structurally guaranteed to match zero rows (empty
  // `visibility` array, or any candidate-set intersection that is
  // empty); callers short-circuit to `[]` / `0` in that case without
  // hitting the database again.
  //
  // The returned `idScope` carries the candidate-set intersection (when
  // one exists) so callers can chunk the `notes.id IN (...)` predicate
  // themselves and stay under the D1 host-var cap. Embedding the IN
  // here would have caused unbounded bind explosion on filter mixes
  // like `visibility=['public']` × `tagIds=[...]` over high-volume
  // owners. See `.issue/165/adr.md` ADR-001.
  private async buildOwnerListWhere(
    ownerId: UserId,
    opts: NoteOwnerCountOpts,
  ): Promise<{
    where: SQL;
    idScope: ReadonlySet<string> | null;
  } | null> {
    // `conditions` is seeded with `eq(notes.ownerId, ownerId)`, so
    // `and(...conditions)` always produces a non-null `SQL` — drizzle
    // returns `undefined` only for an empty argument list. The cast
    // keeps the return type free of a vestigial null branch that
    // callers would otherwise have to defend against.
    const conditions = [eq(notes.ownerId, ownerId)];
    if (opts.status) {
      conditions.push(eq(notes.status, opts.status));
    }
    if (opts.dateRange?.from) {
      conditions.push(gte(notes.updatedAt, opts.dateRange.from.toISOString()));
    }
    if (opts.dateRange?.to) {
      conditions.push(lt(notes.updatedAt, opts.dateRange.to.toISOString()));
    }
    // Subtree directory filter (`.issue/392/adr.md` ADR-001): the caller
    // resolves the selected directory + descendants and passes the flat
    // id set, so this is a `notes.directory_id IN (...)` match, *not* a
    // note-id candidate set. The empty set is the "match nothing"
    // short-circuit. For the common small set we push a single `inArray`
    // predicate (host vars = `directoryIds.length` + the surrounding few,
    // well under the cap) so the fast single-query path
    // (`idScope === null`) still applies. Only when the set exceeds
    // `SAFE_CHUNK_SIZE` do we resolve it to a note-id candidate set so the
    // `IN` predicate stays chunked under the D1 host-var cap — that set is
    // a *note-id* set, fit to merge with the other candidate sets below.
    let directoryNoteIds: ReadonlySet<string> | null = null;
    if (opts.directoryIds !== undefined) {
      if (opts.directoryIds.length === 0) return null;
      if (opts.directoryIds.length <= SAFE_CHUNK_SIZE) {
        conditions.push(inArray(notes.directoryId, [...opts.directoryIds]));
      } else {
        directoryNoteIds = await this.resolveDirectoryNoteCandidates(
          opts.directoryIds,
        );
      }
    }

    // Each filter that needs a multi-row lookup contributes a candidate
    // note-id set; the intersection feeds a single `IN` predicate on
    // the main query. Keeping these as JS-side set ops (instead of
    // nested subqueries) preserves Drizzle's type inference and matches
    // the existing tagIds pattern.
    const candidateSets: Array<ReadonlySet<string>> = [];

    // Large-subtree fallback: the directory filter was resolved to a
    // note-id set above to avoid an over-cap `IN (directory_id...)`.
    if (directoryNoteIds !== null) {
      if (directoryNoteIds.size === 0) return null;
      candidateSets.push(directoryNoteIds);
    }

    if (opts.visibility !== undefined) {
      if (opts.visibility.length === 0) return null;
      const wantsPrivate = opts.visibility.includes("private");
      if (wantsPrivate) {
        // `notExists` keeps the bind count at `notWanted.length`
        // (≤ 2) + ownerId regardless of owner note count, so the
        // main `notes` query no longer hits the D1 host-var cap.
        const pred = this.buildVisibilityNotExistsPredicate(
          ownerId,
          opts.visibility,
        );
        if (pred !== null) conditions.push(pred);
      } else {
        candidateSets.push(
          await this.resolveVisibilityCandidateIds(ownerId, opts.visibility),
        );
      }
    }

    if (opts.tagIds !== undefined && opts.tagIds.length > 0) {
      candidateSets.push(await this.resolveTagAndCandidates(opts.tagIds));
    }

    if (opts.referencingNoteId !== undefined) {
      candidateSets.push(
        await this.resolveReferrerCandidates(opts.referencingNoteId),
      );
    }

    if (candidateSets.length > 0) {
      const intersected = intersectIdSets(candidateSets);
      if (intersected.size === 0) return null;
      return {
        where: and(...conditions) as SQL,
        idScope: intersected,
      };
    }

    return { where: and(...conditions) as SQL, idScope: null };
  }

  // Tag AND-filter: a note matches when it carries *every* supplied tag.
  // The cheapest expression in SQLite is `note_id IN (SELECT ... GROUP
  // BY note_id HAVING count(distinct tag_id) = N)` — but Drizzle's typed
  // builder doesn't model subqueries on `inArray` cleanly. Two-pass
  // instead: pull the candidate note ids first, then intersect.
  private async resolveTagAndCandidates(
    tagIds: readonly TagId[],
  ): Promise<ReadonlySet<string>> {
    const tagRows = await selectInChunks(tagIds, (chunk) =>
      this.db
        .select({ noteId: noteTags.noteId, tagId: noteTags.tagId })
        .from(noteTags)
        .where(inArray(noteTags.tagId, [...chunk])),
    );
    const countByNote = new Map<string, Set<string>>();
    for (const row of tagRows) {
      const seen = countByNote.get(row.noteId) ?? new Set<string>();
      seen.add(row.tagId);
      countByNote.set(row.noteId, seen);
    }
    const matched = new Set<string>();
    for (const [noteId, seen] of countByNote) {
      if (seen.size === tagIds.length) matched.add(noteId);
    }
    return matched;
  }

  // `wantsPrivate === false`: a direct lookup on `publication_states`
  // is enough. The "row absent ⇒ private" invariant doesn't matter
  // here — only ids that have an explicit row in the desired visibility
  // set qualify, and that set excludes `private`.
  private async resolveVisibilityCandidateIds(
    ownerId: UserId,
    visibility: readonly PublicationVisibility[],
  ): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .select({ noteId: publicationStates.noteId })
      .from(publicationStates)
      .where(
        and(
          eq(publicationStates.ownerId, ownerId),
          inArray(publicationStates.visibility, [...visibility]),
        ),
      );
    const out = new Set<string>();
    for (const r of rows) out.add(r.noteId);
    return out;
  }

  // `wantsPrivate === true`: instead of materialising every owner id
  // and intersecting, emit a correlated `NOT EXISTS` against the
  // publication-state rows whose visibility is *not* desired. That
  // matches both explicit `private` (row exists with visibility in the
  // desired set) and implicit `private` (no row at all), without ever
  // feeding owner-scoped ids into `inArray(notes.id, [...])`.
  // The `ownerId` predicate inside the subquery is logically
  // redundant — `ps.note_id` is the PK and FKs back into the outer
  // `notes` filtered by `notes.owner_id = ?` — but it lets the planner
  // use `idx_pubs_visibility_owner (visibility, owner_id)` instead of
  // the PK alone. See ADR-001 §補足.
  private buildVisibilityNotExistsPredicate(
    ownerId: UserId,
    visibility: readonly PublicationVisibility[],
  ): SQL | null {
    const notWanted = (
      [
        "private",
        "unlisted",
        "public",
      ] as const satisfies readonly PublicationVisibility[]
    ).filter((v) => !visibility.includes(v));
    if (notWanted.length === 0) return null;
    return notExists(
      this.db
        .select({ noteId: publicationStates.noteId })
        .from(publicationStates)
        .where(
          and(
            eq(publicationStates.noteId, notes.id),
            eq(publicationStates.ownerId, ownerId),
            inArray(publicationStates.visibility, [...notWanted]),
          ),
        ),
    );
  }

  // Large-subtree fallback (`.issue/392/adr.md` ADR-001): when the
  // resolved subtree holds more than `SAFE_CHUNK_SIZE` directories, a
  // single `IN (directory_id...)` would overflow the D1 host-var cap, so
  // chunk the lookup into a *note-id* candidate set that merges with the
  // other candidate sets and rides the existing `idScope` chunk path.
  private async resolveDirectoryNoteCandidates(
    directoryIds: readonly DirectoryId[],
  ): Promise<ReadonlySet<string>> {
    const rows = await selectInChunks(
      directoryIds as readonly string[],
      (chunk) =>
        this.db
          .select({ id: notes.id })
          .from(notes)
          .where(inArray(notes.directoryId, [...chunk])),
    );
    const out = new Set<string>();
    for (const r of rows) out.add(r.id);
    return out;
  }

  private async resolveReferrerCandidates(
    targetNoteId: NoteId,
  ): Promise<ReadonlySet<string>> {
    const linkRows = await this.db
      .select({ fromNoteId: noteInternalLinks.fromNoteId })
      .from(noteInternalLinks)
      .where(eq(noteInternalLinks.resolvedNoteId, targetNoteId));
    const out = new Set<string>();
    for (const r of linkRows) out.add(r.fromNoteId);
    return out;
  }

  findTrashedOlderThan(
    ownerId: UserId,
    before: Date,
  ): Promise<readonly Note[]> {
    return mapDbError("Failed to find trashed notes", async () => {
      const rows = await this.db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.ownerId, ownerId),
            eq(notes.status, "trashed"),
            isNotNull(notes.trashedAt),
            lt(notes.trashedAt, before.toISOString()),
          ),
        )
        .orderBy(asc(notes.trashedAt), asc(notes.id));
      return this.hydrateMany(rows);
    });
  }

  findReferrers(targetNoteId: NoteId): Promise<readonly Note[]> {
    return mapDbError("Failed to find note referrers", async () => {
      const linkRows = await this.db
        .select({ fromNoteId: noteInternalLinks.fromNoteId })
        .from(noteInternalLinks)
        .where(eq(noteInternalLinks.resolvedNoteId, targetNoteId));
      const fromIds = Array.from(
        new Set(linkRows.map((row) => row.fromNoteId)),
      );
      if (fromIds.length === 0) return [];
      // Chunked to stay under the D1 host-var cap; the per-chunk SQL
      // ORDER BY no longer holds across the combined row set, so re-sort
      // in JS before hydration. `updated_at` is stored as ISO-8601
      // text (lexicographic == chronological for the same prefix
      // length) and `id` is UUIDv7 — both are safe to compare as
      // strings under SQLite's BINARY collation.
      const rows = await selectInChunks(fromIds, (chunk) =>
        this.db
          .select()
          .from(notes)
          .where(inArray(notes.id, [...chunk])),
      );
      const sorted = sortNoteRowsBy(rows, "updatedAt", "desc");
      return this.hydrateMany(sorted);
    });
  }

  findUnresolvedTitleLinkRows(
    ownerId: UserId,
    title: string,
  ): Promise<readonly { id: string; fromNoteId: NoteId }[]> {
    return mapDbError("Failed to find unresolved title link rows", async () => {
      // `note_internal_links` has no owner column, so join onto `notes`
      // (the `from` note) to scope by owner + active status. The
      // `lower(refTarget) = lower(?)` comparison is a function-expr
      // filter — `idx_nil_target (refKind, refTarget)` only narrows on
      // the `refKind='title'` prefix; the owner+active join keeps the
      // candidate set small (see #127 ADR-002).
      const rows = await this.db
        .select({
          id: noteInternalLinks.id,
          fromNoteId: noteInternalLinks.fromNoteId,
        })
        .from(noteInternalLinks)
        .innerJoin(notes, eq(notes.id, noteInternalLinks.fromNoteId))
        .where(
          and(
            eq(notes.ownerId, ownerId),
            eq(notes.status, "active"),
            eq(noteInternalLinks.refKind, "title"),
            isNull(noteInternalLinks.resolvedNoteId),
            sql`lower(${noteInternalLinks.refTarget}) = lower(${title})`,
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        fromNoteId: r.fromNoteId as NoteId,
      }));
    });
  }

  findUnresolvedIdLinkRows(
    ownerId: UserId,
    targetNoteId: NoteId,
  ): Promise<readonly { id: string; fromNoteId: NoteId }[]> {
    return mapDbError("Failed to find unresolved id link rows", async () => {
      // Same owner/active join as the title variant. The id link's
      // `refTarget` carries the raw target note id verbatim; exclude the
      // self link so a note pointing at its own id never resolves
      // (ADR-005).
      const rows = await this.db
        .select({
          id: noteInternalLinks.id,
          fromNoteId: noteInternalLinks.fromNoteId,
        })
        .from(noteInternalLinks)
        .innerJoin(notes, eq(notes.id, noteInternalLinks.fromNoteId))
        .where(
          and(
            eq(notes.ownerId, ownerId),
            eq(notes.status, "active"),
            eq(noteInternalLinks.refKind, "id"),
            isNull(noteInternalLinks.resolvedNoteId),
            eq(noteInternalLinks.refTarget, targetNoteId),
            sql`${noteInternalLinks.fromNoteId} <> ${targetNoteId}`,
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        fromNoteId: r.fromNoteId as NoteId,
      }));
    });
  }

  findResolvedLinkRowsByTarget(targetNoteId: NoteId): Promise<
    readonly {
      id: string;
      fromNoteId: NoteId;
      refKind: "id" | "title";
      refTarget: string;
    }[]
  > {
    return mapDbError(
      "Failed to find resolved link rows by target",
      async () => {
        // Same `where` as `findReferrers` (`idx_nil_resolved`), but
        // returns the raw link-row shape instead of hydrated notes.
        const rows = await this.db
          .select({
            id: noteInternalLinks.id,
            fromNoteId: noteInternalLinks.fromNoteId,
            refKind: noteInternalLinks.refKind,
            refTarget: noteInternalLinks.refTarget,
          })
          .from(noteInternalLinks)
          .where(eq(noteInternalLinks.resolvedNoteId, targetNoteId));
        return rows.map((r) => ({
          id: r.id,
          fromNoteId: r.fromNoteId as NoteId,
          refKind: r.refKind as "id" | "title",
          refTarget: r.refTarget,
        }));
      },
    );
  }

  countByOwner(ownerId: UserId, opts?: NoteOwnerCountOpts): Promise<number> {
    return mapDbError("Failed to count notes", async () => {
      const built = await this.buildOwnerListWhere(ownerId, opts ?? {});
      if (built === null) return 0;
      const { where, idScope } = built;
      if (idScope === null) {
        const rows = await this.db
          .select({ c: count() })
          .from(notes)
          .where(where);
        return rows[0]?.c ?? 0;
      }
      // Same chunk-and-fold strategy as `findByOwner`: the additional
      // predicates in `where` may strip ids from `idScope`, so we have
      // to ask the DB which ids actually pass the full filter rather
      // than returning `idScope.size`. See ADR-001 §補足.
      const rows = await selectInChunks(Array.from(idScope), (chunk) =>
        this.db
          .select({ c: count() })
          .from(notes)
          .where(and(where, inArray(notes.id, [...chunk]))),
      );
      return rows.reduce((acc, r) => acc + r.c, 0);
    });
  }

  // ---------------------------------------------------------------------
  // Writes (buffered onto PendingBatch)
  // ---------------------------------------------------------------------

  // First-time persistence. Buffered like `save`; conflicts on the
  // primary key (rare — `Note.create` mints a fresh id) or the
  // `(owner_id, slug)` UNIQUE index surface as `ConflictError` through
  // `mapDbError` at flush time. The slug UNIQUE constraint is a partial
  // index scoped to `status = 'active'` (see migration
  // `0007_notes_slug_partial_unique.sql` and `schema.ts`
  // `uniq_notes_owner_slug`), so trashed rows can share an `(owner_id,
  // slug)` with an active row — only collisions among `active` rows
  // surface here.
  async insert(note: Note): Promise<void> {
    this.pending.add(this.db.insert(notes).values(this.noteValues(note)));
    this.bufferChildInserts(note);
  }

  async save(
    note: Note,
    expectedVersion: ExpectedVersion<Note>,
  ): Promise<void> {
    const noteId = note.id;
    this.pending.addOcc(
      this.db
        .update(notes)
        .set(this.noteUpdateValues(note))
        .where(
          and(
            eq(notes.id, noteId),
            eq(notes.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving note ${noteId}: expected version ${expectedVersion}`,
        );
      },
    );
    // Child rows are rewritten wholesale on every save. ON DELETE
    // CASCADE on the parent FKs is not at play here because the parent
    // row stays — we issue an explicit delete+reinsert pair.
    this.pending.add(
      this.db.delete(noteTags).where(eq(noteTags.noteId, noteId)),
    );
    this.pending.add(
      this.db
        .delete(noteInternalLinks)
        .where(eq(noteInternalLinks.fromNoteId, noteId)),
    );
    this.pending.add(
      this.db.delete(noteMediaRefs).where(eq(noteMediaRefs.noteId, noteId)),
    );
    this.bufferChildInserts(note);
  }

  async delete(
    id: string,
    expectedVersion: ExpectedVersion<Note>,
  ): Promise<void> {
    // Child rows go via `ON DELETE CASCADE` on the FK, so the parent
    // delete is sufficient. The OCC guard fires on the parent
    // statement; the cascade does not influence `changes()`.
    this.pending.addOcc(
      this.db
        .delete(notes)
        .where(
          and(eq(notes.id, id), eq(notes.version, expectedVersion as number)),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting note ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async trashByDirectory(directoryId: DirectoryId): Promise<readonly NoteId[]> {
    return mapDbError("Failed to trash notes by directory", async () => {
      // Read the set of about-to-be-trashed ids up front. The bulk
      // update runs as part of the next batch flush (or immediately, if
      // there is no surrounding UoW writer to share the batch with —
      // here we buffer it to keep the call site consistent with the
      // rest of the repository).
      const candidates = await this.db
        .select({ id: notes.id, version: notes.version })
        .from(notes)
        .where(
          and(eq(notes.directoryId, directoryId), eq(notes.status, "active")),
        );
      if (candidates.length === 0) return [];
      const now = new Date().toISOString();
      for (const row of candidates) {
        // No OCC guard here: this is a sweep operation whose contract
        // (idempotency, skip already-trashed) is enforced by the
        // `status = 'active'` predicate. A concurrent edit on a row
        // either races us to trashed (and our update is a no-op,
        // which is the correct outcome) or runs after us and sees the
        // bumped version.
        this.pending.add(
          this.db
            .update(notes)
            .set({
              status: "trashed",
              trashedAt: now,
              updatedAt: now,
              editLockUserId: null,
              editLockAcquiredAt: null,
              editLockExpiresAt: null,
              version: row.version + 1,
            })
            .where(and(eq(notes.id, row.id), eq(notes.status, "active"))),
        );
      }
      return candidates.map(({ id }) => id as NoteId);
    });
  }

  async setLinkResolution(
    linkRowIds: readonly string[],
    resolvedNoteId: NoteId | null,
  ): Promise<void> {
    if (linkRowIds.length === 0) return;
    // Buffered onto the pending batch like the aggregate child writes so
    // the resolution update commits atomically with the surrounding UoW
    // (Issue #321 ADR-008). Chunk the `IN (...)` predicate under the D1
    // host-var cap; `+1` host var for the `resolved_note_id` SET value
    // stays within the `SAFE_CHUNK_SIZE` margin. NOTE: if this statement
    // ever grows extra bound predicates (owner/status filters, etc.),
    // account for them on top of the SET var when sizing the chunk.
    for (let i = 0; i < linkRowIds.length; i += SAFE_CHUNK_SIZE) {
      const chunk = linkRowIds.slice(i, i + SAFE_CHUNK_SIZE);
      this.pending.add(
        this.db
          .update(noteInternalLinks)
          .set({ resolvedNoteId })
          .where(inArray(noteInternalLinks.id, chunk)),
      );
    }
  }

  async purge(id: NoteId): Promise<void> {
    // Physical delete bypasses OCC: by the time a note reaches the
    // retention purge worker, the row is already in the trashed state
    // and the user can no longer mutate it.
    this.pending.add(this.db.delete(notes).where(eq(notes.id, id)));
  }

  // ---------------------------------------------------------------------
  // Row construction helpers
  // ---------------------------------------------------------------------

  private noteValues(note: Note): typeof notes.$inferInsert {
    return {
      id: note.id,
      ownerId: note.ownerId,
      directoryId: note.directoryId,
      slug: note.slug,
      title: note.title,
      contentHtml: note.contentHtml,
      frontMatterJson: JSON.stringify(note.frontMatter),
      status: note.status,
      trashedAt: note.trashedAt === null ? null : note.trashedAt.toISOString(),
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      editLockUserId: note.editLock?.userId ?? null,
      editLockAcquiredAt: note.editLock?.acquiredAt.toISOString() ?? null,
      editLockExpiresAt: note.editLock?.expiresAt.toISOString() ?? null,
      version: note.version,
    };
  }

  private noteUpdateValues(note: Note): Partial<typeof notes.$inferInsert> {
    return {
      directoryId: note.directoryId,
      slug: note.slug,
      title: note.title,
      contentHtml: note.contentHtml,
      frontMatterJson: JSON.stringify(note.frontMatter),
      status: note.status,
      trashedAt: note.trashedAt === null ? null : note.trashedAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      editLockUserId: note.editLock?.userId ?? null,
      editLockAcquiredAt: note.editLock?.acquiredAt.toISOString() ?? null,
      editLockExpiresAt: note.editLock?.expiresAt.toISOString() ?? null,
      version: note.version,
    };
  }

  private bufferChildInserts(note: Note): void {
    if (note.tagIds.length > 0) {
      this.pending.add(
        this.db
          .insert(noteTags)
          .values(note.tagIds.map((tagId) => ({ noteId: note.id, tagId }))),
      );
    }
    if (note.internalLinkRefs.length > 0) {
      this.pending.add(
        this.db.insert(noteInternalLinks).values(
          note.internalLinkRefs.map((ref) => ({
            id: this.idGenerator.next(),
            fromNoteId: note.id,
            refKind: ref.kind,
            refTarget: ref.target,
            displayText: ref.displayText,
            resolvedNoteId: ref.resolvedNoteId,
          })),
        ),
      );
    }
    if (note.mediaRefs.length > 0) {
      this.pending.add(
        this.db
          .insert(noteMediaRefs)
          .values(
            note.mediaRefs.map((mediaId) => ({ noteId: note.id, mediaId })),
          ),
      );
    }
  }
}

function intersectIdSets(
  sets: ReadonlyArray<ReadonlySet<string>>,
): ReadonlySet<string> {
  if (sets.length === 0) return new Set();
  let smallestIdx = 0;
  for (let i = 1; i < sets.length; i += 1) {
    if (sets[i].size < sets[smallestIdx].size) smallestIdx = i;
  }
  const base = sets[smallestIdx];
  const out = new Set<string>();
  outer: for (const id of base) {
    for (let i = 0; i < sets.length; i += 1) {
      if (i === smallestIdx) continue;
      if (!sets[i].has(id)) continue outer;
    }
    out.add(id);
  }
  return out;
}

// Cross-chunk JS-side re-sort for the `findByOwner` / `findReferrers`
// chunk paths. SQL ORDER BY can only sort within a single chunk's
// result set, so we re-apply the listing's primary sort here with
// `desc(id)` as the tie-break (matches the in-DB query). `updatedAt`
// / `createdAt` are ISO-8601 ms text and `id` is UUIDv7 — both are
// ASCII, so SQLite BINARY collation and JS string compare agree.
// `title` is application-supplied text; for BMP-range characters the
// two collations agree too. See `.issue/165/adr.md` for the analysis.
//
// Generic over the row shape so the same helper sorts both the Pass-1
// `{ id, [sortCol] }` projection (Issue #171) and the full `NoteRow`
// fetched by `findReferrers`. The `T` constraint pins down only the
// columns the comparator actually reads — `id` plus every `SortColumn`
// (all three are `string` in the current schema: ISO-8601 for
// `updatedAt`/`createdAt`, application text for `title`).
function sortNoteRowsBy<
  T extends { readonly id: string } & { readonly [K in SortColumn]: string },
>(rows: readonly T[], sortCol: SortColumn, order: "asc" | "desc"): T[] {
  const dir = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortCol];
    const bv = b[sortCol];
    if (av !== bv) {
      return av < bv ? -dir : dir;
    }
    // Tie-break: id desc (matches `desc(notes.id)` in the SQL path).
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

function pickSortColumn(sort: NoteListOpts["sort"]): SortColumn {
  switch (sort) {
    case "createdAt":
      return "createdAt";
    case "title":
      return "title";
    case "updatedAt":
    case undefined:
      return "updatedAt";
  }
}
