import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  notExists,
  type SQL,
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
import { selectInChunks } from "./_chunks";
import { mapDbError } from "./helpers";

type NoteRow = typeof notes.$inferSelect;
type NoteTagRow = typeof noteTags.$inferSelect;
type NoteInternalLinkRow = typeof noteInternalLinks.$inferSelect;
type NoteMediaRefRow = typeof noteMediaRefs.$inferSelect;

type SortColumn = "updatedAt" | "createdAt" | "title";

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

  findByOwnerAndSlug(ownerId: UserId, slug: NoteSlug): Promise<Note | null> {
    return mapDbError("Failed to find note by owner/slug", async () => {
      const rows = await this.db
        .select()
        .from(notes)
        .where(and(eq(notes.ownerId, ownerId), eq(notes.slug, slug)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const children = await this.loadChildren([row.id]);
      return this.toNote(row, children);
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

      const conditions = [eq(notes.ownerId, ownerId)];
      if (opts.status) {
        conditions.push(eq(notes.status, opts.status));
      }
      if (opts.dateRange?.from) {
        conditions.push(
          gte(notes.updatedAt, opts.dateRange.from.toISOString()),
        );
      }
      if (opts.dateRange?.to) {
        conditions.push(lt(notes.updatedAt, opts.dateRange.to.toISOString()));
      }

      // Each filter that needs a multi-row lookup contributes a candidate
      // note-id set; the intersection feeds a single `IN` predicate on
      // the main query. Keeping these as JS-side set ops (instead of
      // nested subqueries) preserves Drizzle's type inference and matches
      // the existing tagIds pattern.
      const candidateSets: Array<ReadonlySet<string>> = [];

      if (opts.visibility !== undefined) {
        if (opts.visibility.length === 0) return [];
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
        if (intersected.size === 0) return [];
        conditions.push(inArray(notes.id, [...intersected]));
      }

      const rows = await this.db
        .select()
        .from(notes)
        .where(and(...conditions))
        .orderBy(
          order === "asc" ? asc(notes[sortCol]) : desc(notes[sortCol]),
          desc(notes.id),
        )
        .limit(opts.limit)
        .offset(opts.offset);
      return this.hydrateMany(rows);
    });
  }

  // Tag AND-filter: a note matches when it carries *every* supplied tag.
  // The cheapest expression in SQLite is `note_id IN (SELECT ... GROUP
  // BY note_id HAVING count(distinct tag_id) = N)` — but Drizzle's typed
  // builder doesn't model subqueries on `inArray` cleanly. Two-pass
  // instead: pull the candidate note ids first, then intersect.
  private async resolveTagAndCandidates(
    tagIds: readonly TagId[],
  ): Promise<ReadonlySet<string>> {
    const tagRows = await this.db
      .select({ noteId: noteTags.noteId, tagId: noteTags.tagId })
      .from(noteTags)
      .where(inArray(noteTags.tagId, [...tagIds]));
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
      const sorted = [...rows].sort((a, b) => {
        if (a.updatedAt !== b.updatedAt) {
          return a.updatedAt < b.updatedAt ? 1 : -1;
        }
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
      });
      return this.hydrateMany(sorted);
    });
  }

  countByOwner(ownerId: UserId): Promise<number> {
    return mapDbError("Failed to count notes", async () => {
      // `count(*)` would be faster but Drizzle's typed builder needs
      // the projection to spell out a column; pulling the id only is
      // cheap in SQLite (no row body materialisation).
      const rows = await this.db
        .select({ id: notes.id })
        .from(notes)
        .where(eq(notes.ownerId, ownerId));
      return rows.length;
    });
  }

  // ---------------------------------------------------------------------
  // Writes (buffered onto PendingBatch)
  // ---------------------------------------------------------------------

  // First-time persistence. Buffered like `save`; conflicts on the
  // primary key (rare — `Note.create` mints a fresh id) or the
  // `(owner_id, slug)` UNIQUE index surface as `ConflictError` through
  // `mapDbError` at flush time.
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
