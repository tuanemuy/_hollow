import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
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
import { isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { DateRange } from "@/core/domain/note/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { PublicationState } from "@/core/domain/publication/entity";
import type {
  PublicationListOpts,
  PublicationStateRepository,
  PublicNoteSortedOpts,
  PublicNoteSortedResult,
} from "@/core/domain/publication/ports/publicationStateRepository";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { notes, publicationStates } from "../schema";
import { selectInChunks } from "./_chunks";
import { mapDbError } from "./helpers";

/**
 * Row shape used by the chunked candidate path of the sorted listing.
 * `publishedAt` is typed non-null because the query filters
 * `isNotNull(published_at)`, but the column itself is nullable.
 */
type SortedRow = Readonly<{ noteId: string; publishedAt: string }>;

type PublicationStateRow = typeof publicationStates.$inferSelect;

// `published_at` is ISO-8601 text (lexicographic compare matches chronological order).
// DateRange is half-open `[from, to)`; the presentation boundary pushed the
// inclusive end date to day-after-00:00, so here `from` is `gte` and `to` is `lt`.
function publishedRangeConditions(range: DateRange | undefined): SQL[] {
  if (range === undefined) return [];
  const conditions: SQL[] = [];
  if (range.from !== null) {
    conditions.push(
      gte(publicationStates.publishedAt, range.from.toISOString()),
    );
  }
  if (range.to !== null) {
    conditions.push(lt(publicationStates.publishedAt, range.to.toISOString()));
  }
  return conditions;
}

/**
 * D1 implementation of `PublicationStateRepository`. Mirrors
 * `D1NoteRepository` — reads run immediately, writes buffer onto the
 * surrounding `PendingBatch` so `D1UnitOfWorkProvider` can flush them
 * atomically. The aggregate id is `NoteId`; the table's primary key
 * column `note_id` doubles as that id, so `findById` and `findByNoteId`
 * (the spec wording) collapse onto the same operation.
 */
export class D1PublicationStateRepository
  implements PublicationStateRepository
{
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toEntity(row: PublicationStateRow): PublicationState {
    if (!this.idGenerator.validate(row.noteId)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored publication_state has malformed note id: ${row.noteId}`,
      );
    }
    try {
      return PublicationState.reconstruct({
        noteId: row.noteId,
        ownerId: row.ownerId,
        visibility: row.visibility,
        publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
        updatedAt: new Date(row.updatedAt),
        version: row.version,
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored publication_state violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: PublicationStateRow): Versioned<PublicationState> {
    return {
      entity: this.toEntity(row),
      expectedVersion: row.version as ExpectedVersion<PublicationState>,
    };
  }

  findById(id: NoteId): Promise<Versioned<PublicationState> | null> {
    return mapDbError("Failed to find publication_state", async () => {
      const rows = await this.db
        .select()
        .from(publicationStates)
        .where(eq(publicationStates.noteId, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  async insert(state: PublicationState): Promise<void> {
    this.pending.add(
      this.db.insert(publicationStates).values({
        noteId: state.noteId,
        ownerId: state.ownerId,
        visibility: state.visibility,
        publishedAt: state.publishedAt ? state.publishedAt.toISOString() : null,
        updatedAt: state.updatedAt.toISOString(),
        version: state.version,
      }),
    );
  }

  async save(
    state: PublicationState,
    expectedVersion: ExpectedVersion<PublicationState>,
  ): Promise<void> {
    const noteId = state.noteId;
    this.pending.addOcc(
      this.db
        .update(publicationStates)
        .set({
          visibility: state.visibility,
          publishedAt: state.publishedAt
            ? state.publishedAt.toISOString()
            : null,
          updatedAt: state.updatedAt.toISOString(),
          version: state.version,
        })
        .where(
          and(
            eq(publicationStates.noteId, state.noteId),
            eq(publicationStates.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving publication_state ${noteId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: NoteId,
    expectedVersion: ExpectedVersion<PublicationState>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(publicationStates)
        .where(
          and(
            eq(publicationStates.noteId, id),
            eq(publicationStates.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting publication_state ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  findPublicByOwner(
    ownerId: UserId,
    opts: PublicationListOpts,
  ): Promise<readonly NoteId[]> {
    return mapDbError("Failed to list public publication_states", async () => {
      // `published_at` is set whenever visibility is `public` (and cleared on
      // transitions away from public), so ordering by it gives a stable
      // timeline. The note id is used as a deterministic tiebreaker and as
      // the keyset cursor.
      const conditions = [
        eq(publicationStates.ownerId, ownerId),
        eq(publicationStates.visibility, "public"),
        isNotNull(publicationStates.publishedAt),
      ];
      if (opts.cursor !== undefined) {
        conditions.push(sql`${publicationStates.noteId} > ${opts.cursor}`);
      }
      const rows = await this.db
        .select({ noteId: publicationStates.noteId })
        .from(publicationStates)
        .where(and(...conditions))
        .orderBy(asc(publicationStates.noteId))
        .limit(opts.limit);
      return rows.map((r) => NoteId.create(r.noteId));
    });
  }

  listPublicNoteIdsByOwnerSorted(
    ownerId: UserId,
    opts: PublicNoteSortedOpts,
  ): Promise<PublicNoteSortedResult> {
    return mapDbError(
      "Failed to list public publication_states sorted by published_at",
      async () => {
        // An empty candidate set (tag AND-filter resolved to nothing the
        // owner has) can never match — short-circuit without touching DB.
        if (opts.noteIds !== undefined && opts.noteIds.length === 0) {
          return { noteIds: [], total: 0 };
        }
        if (opts.noteIds !== undefined) {
          return this.listSortedWithinCandidates(ownerId, opts, opts.noteIds);
        }
        return this.listSortedAll(ownerId, opts);
      },
    );
  }

  // No-candidate path (tag未指定): the listing is fully index-served by
  // `idx_pubs_owner_visibility_published_at` and never overflows the D1
  // host-variable cap (only owner is bound). Count and page run over the same
  // `active`-note population — the trash → relay lag can leave a public
  // publication_states row for a note already `trashed`, and counting
  // publication rows alone would inflate `total` past what the active-only
  // page can render.
  private async listSortedAll(
    ownerId: UserId,
    opts: PublicNoteSortedOpts,
  ): Promise<PublicNoteSortedResult> {
    const whereClause = and(
      eq(publicationStates.ownerId, ownerId),
      eq(publicationStates.visibility, "public"),
      isNotNull(publicationStates.publishedAt),
      eq(notes.status, "active"),
      ...publishedRangeConditions(opts.publishedRange),
    );

    const orderBy =
      opts.order === "asc"
        ? [asc(publicationStates.publishedAt), asc(publicationStates.noteId)]
        : [desc(publicationStates.publishedAt), asc(publicationStates.noteId)];

    const rows = await this.db
      .select({ noteId: publicationStates.noteId })
      .from(publicationStates)
      .innerJoin(notes, eq(notes.id, publicationStates.noteId))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(opts.limit)
      .offset(opts.offset);

    const countRows = await this.db
      .select({ value: count() })
      .from(publicationStates)
      .innerJoin(notes, eq(notes.id, publicationStates.noteId))
      .where(whereClause);

    return {
      noteIds: rows.map((r) => NoteId.create(r.noteId)),
      total: Number(countRows[0]?.value ?? 0),
    };
  }

  // Candidate path (tag AND-filter pre-resolved to ids): the candidate set can
  // reach `TAG_CANDIDATE_CAP` (1000) ids, far above the D1 host-variable cap,
  // so a single `note_id IN (...)` would overflow it. Split the candidates by
  // `SAFE_CHUNK_SIZE` and resolve each chunk's matching (note_id, published_at)
  // rows, then merge, sort, count, and page in memory. Candidates are
  // active-note ids supplied by the caller (`noteRepository.findByOwner({
  // status: 'active', tagIds })`), so no trashed row can sneak in and the
  // `notes` status JOIN is unnecessary here. The count and the page derive
  // from the same merged population, so `items.length <= total` holds and the
  // window stays independent of the total.
  private async listSortedWithinCandidates(
    ownerId: UserId,
    opts: PublicNoteSortedOpts,
    candidates: readonly NoteId[],
  ): Promise<PublicNoteSortedResult> {
    const rows = await selectInChunks<SortedRow>(candidates, async (chunk) => {
      const chunkRows = await this.db
        .select({
          noteId: publicationStates.noteId,
          publishedAt: publicationStates.publishedAt,
        })
        .from(publicationStates)
        .where(
          and(
            eq(publicationStates.ownerId, ownerId),
            eq(publicationStates.visibility, "public"),
            isNotNull(publicationStates.publishedAt),
            inArray(publicationStates.noteId, [...chunk]),
            ...publishedRangeConditions(opts.publishedRange),
          ),
        );
      // `isNotNull` (line 316) guarantees a non-null published_at; narrow
      // the column type safely.
      return chunkRows.map((r) => ({
        noteId: r.noteId,
        publishedAt: r.publishedAt as string,
      }));
    });

    // `published_at` is stored as an ISO-8601 text column, so a lexicographic
    // string compare matches chronological order. Candidate ids are unique, so
    // chunks never overlap and no dedup is needed. Tie-break on note_id keeps
    // the order total and deterministic (mirrors the SQL ORDER BY above).
    const sign = opts.order === "asc" ? 1 : -1;
    const sorted = [...rows].sort((l, r) => {
      if (l.publishedAt !== r.publishedAt) {
        return l.publishedAt < r.publishedAt ? -sign : sign;
      }
      return l.noteId < r.noteId ? -1 : l.noteId > r.noteId ? 1 : 0;
    });

    const page = sorted.slice(opts.offset, opts.offset + opts.limit);
    return {
      noteIds: page.map((r) => NoteId.create(r.noteId)),
      total: sorted.length,
    };
  }

  listPublicNoteIdsByOwnerInRange(
    ownerId: UserId,
    publishedRange: DateRange,
    limit: number,
  ): Promise<readonly NoteId[]> {
    return mapDbError(
      "Failed to list public publication_states in published_at range",
      async () => {
        const rows = await this.db
          .select({ noteId: publicationStates.noteId })
          .from(publicationStates)
          .innerJoin(notes, eq(notes.id, publicationStates.noteId))
          .where(
            and(
              eq(publicationStates.ownerId, ownerId),
              eq(publicationStates.visibility, "public"),
              isNotNull(publicationStates.publishedAt),
              eq(notes.status, "active"),
              ...publishedRangeConditions(publishedRange),
            ),
          )
          .orderBy(asc(publicationStates.noteId))
          .limit(limit);
        return rows.map((r) => NoteId.create(r.noteId));
      },
    );
  }

  findByNoteIds(ids: readonly NoteId[]): Promise<readonly PublicationState[]> {
    return mapDbError("Failed to bulk-read publication_states", async () => {
      if (ids.length === 0) return [];
      const rows = await selectInChunks(ids, (chunk) =>
        this.db
          .select()
          .from(publicationStates)
          .where(inArray(publicationStates.noteId, [...chunk])),
      );
      return rows.map((row) => this.toEntity(row));
    });
  }

  findAllPublic(
    opts: PublicationListOpts,
  ): Promise<readonly Readonly<{ ownerId: UserId; noteId: NoteId }>[]> {
    return mapDbError(
      "Failed to enumerate public publication_states",
      async () => {
        const conditions = [
          eq(publicationStates.visibility, "public"),
          isNotNull(publicationStates.publishedAt),
        ];
        if (opts.cursor !== undefined) {
          conditions.push(sql`${publicationStates.noteId} > ${opts.cursor}`);
        }
        const rows = await this.db
          .select({
            ownerId: publicationStates.ownerId,
            noteId: publicationStates.noteId,
          })
          .from(publicationStates)
          .where(and(...conditions))
          .orderBy(asc(publicationStates.noteId))
          .limit(opts.limit);
        return rows.map((r) => ({
          ownerId: r.ownerId as UserId,
          noteId: NoteId.create(r.noteId),
        }));
      },
    );
  }
}
