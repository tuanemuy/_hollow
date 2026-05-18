import { sql } from "drizzle-orm";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import { isRehydrationError } from "@/core/domain/error";
import { UserId, Username } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import type { SearchDocument } from "@/core/domain/search/entity";
import {
  type SearchIndex,
  SearchIndexUnavailableError,
  type SearchQueryResult,
} from "@/core/domain/search/ports/searchIndex";
import {
  SearchCursor,
  type SearchQuery,
  SearchScore,
  SearchSnippet,
  SearchTitle,
  Visibility,
} from "@/core/domain/search/valueObject";
import type { Database } from "./client";
import { escapeLikePattern, mapDbError } from "./repositories/helpers";
import { searchDocuments } from "./schema";

const BULK_REBUILD_CHUNK_SIZE = 100;
const SNIPPET_TOKEN_BUDGET = 24;

type SearchRow = Readonly<{
  noteId: string;
  ownerId: string;
  username: string;
  title: string;
  snippet: string;
  tagNamesJson: string;
  visibility: string;
  score: number;
}>;

/**
 * D1 implementation of `SearchIndex`.
 *
 * Writes (`upsert` / `delete`) target the host table `search_documents`;
 * the FTS5 virtual table `search_documents_fts` is kept in sync by the
 * `search_documents_ai/ad/au` triggers declared in the migration, so the
 * adapter never touches the virtual table on writes.
 *
 * Reads (`query`) execute against `search_documents_fts MATCH ?` joined
 * back to `search_documents` (for non-FTS filters and full row hydration)
 * and `users` (for the hit's `username`). `bm25()` ranks results and
 * `snippet()` produces the highlighted excerpt.
 *
 * Cursor encoding is opaque: the adapter stores a base64 offset because
 * BM25 ranks ties cannot be split deterministically by `rowid` without
 * exposing the host's `rowid` to the cursor — offset pagination is
 * sufficient for the cap (`SearchLimit` ≤ 50) the domain accepts.
 *
 * `SearchIndexUnavailableError` is only raised when the upstream `db`
 * binding itself is missing (programming / DI error). Other driver-level
 * failures flow through `mapDbError` and surface as
 * `SystemError(DatabaseError)` to the application layer.
 */
export class D1SearchIndex implements SearchIndex {
  constructor(
    private readonly db: Database,
    private readonly idGenerator: IdGenerator,
  ) {
    if (db === null || db === undefined) {
      throw new SearchIndexUnavailableError(
        "D1SearchIndex constructed without a database binding",
      );
    }
  }

  async upsert(doc: SearchDocument): Promise<void> {
    await mapDbError("Failed to upsert search document", async () => {
      const row = this.toRow(doc);
      // `ON CONFLICT DO UPDATE` is acceptable here because
      // `SearchDocument` carries no OCC version — the index is a derived
      // projection and the upstream Note domain is the source of truth.
      // Idempotent on `noteId` per the port contract.
      await this.db
        .insert(searchDocuments)
        .values(row)
        .onConflictDoUpdate({
          target: searchDocuments.noteId,
          set: {
            ownerId: row.ownerId,
            visibility: row.visibility,
            title: row.title,
            bodyPlain: row.bodyPlain,
            tagNamesJson: row.tagNamesJson,
            directoryPath: row.directoryPath,
            dateForCalendar: row.dateForCalendar,
            updatedAt: row.updatedAt,
            indexedAt: row.indexedAt,
          },
        });
    });
  }

  async delete(noteId: NoteId): Promise<void> {
    await mapDbError("Failed to delete search document", async () => {
      await this.db
        .delete(searchDocuments)
        .where(sql`${searchDocuments.noteId} = ${noteId}`);
    });
  }

  async query(q: SearchQuery): Promise<SearchQueryResult> {
    return mapDbError("Failed to run search query", async () => {
      const limit = q.limit as number;
      const offset = decodeCursor(q.cursor);

      const matchExpr = buildMatchExpression(q.keyword);

      // One extra row over the requested limit so we can compute
      // `nextCursor` without an additional COUNT round trip.
      const peekLimit = limit + 1;

      // FTS contentless table joins back to the host via the implicit
      // `rowid` column (configured `content_rowid='rowid'` in the migration's
      // FTS5 DDL). Comparing `sd.note_id` (text UUID) against `fts.rowid`
      // (integer) silently produces zero rows on every query.
      const filterClauses = [sql`sd.rowid = fts.rowid`];
      filterClauses.push(sql`fts.search_documents_fts MATCH ${matchExpr}`);

      if (q.ownerIdFilter !== null) {
        filterClauses.push(sql`sd.owner_id = ${q.ownerIdFilter}`);
      }
      if (q.visibilityFilter.length > 0) {
        filterClauses.push(
          sql`sd.visibility IN (${sql.join(
            q.visibilityFilter.map((v) => sql`${v}`),
            sql`, `,
          )})`,
        );
      }
      if (q.dateRange !== null) {
        const fromIso = q.dateRange.from.toISOString();
        const toIso = q.dateRange.to.toISOString();
        filterClauses.push(
          sql`sd.date_for_calendar >= ${fromIso} AND sd.date_for_calendar <= ${toIso}`,
        );
      }
      if (q.directoryPathPrefix !== null) {
        // Exact match for the directory itself, or any descendant whose
        // path starts with `${prefix}/`. The latter pattern is escaped
        // for LIKE so `_` / `%` / `\\` in path segments are treated
        // literally.
        const prefix = q.directoryPathPrefix as string;
        const childPattern = `${escapeLikePattern(prefix)}/%`;
        filterClauses.push(
          sql`(sd.directory_path = ${prefix} OR sd.directory_path LIKE ${childPattern} ESCAPE '\\')`,
        );
      }
      // Tag filter is an AND-of-terms over the stored `tag_names_json`
      // array. Using `LIKE '%"<tag>"%'` matches a quoted JSON string token
      // exactly (so `"ai"` does not match `"ai-news"`). The plain LIKE
      // path keeps the planner from giving up on the FTS rank — pushing
      // the tag filter through `MATCH` would intermix free-text and
      // exact-tag semantics in a way the domain does not request.
      for (const tag of q.tagNames) {
        const needle = `%"${escapeLikePattern(tag)}"%`;
        filterClauses.push(sql`sd.tag_names_json LIKE ${needle} ESCAPE '\\'`);
      }

      const whereClause = sql.join(filterClauses, sql` AND `);

      const rows = await this.db.all<SearchRow>(sql`
        SELECT
          sd.note_id      AS "noteId",
          sd.owner_id     AS "ownerId",
          u.username      AS "username",
          sd.title        AS "title",
          snippet(fts.search_documents_fts, 1, '<mark>', '</mark>', '…', ${SNIPPET_TOKEN_BUDGET}) AS "snippet",
          sd.tag_names_json AS "tagNamesJson",
          sd.visibility   AS "visibility",
          bm25(fts.search_documents_fts) AS "score"
        FROM search_documents_fts AS fts
        JOIN search_documents AS sd
        JOIN users AS u ON u.id = sd.owner_id
        WHERE ${whereClause}
        ORDER BY bm25(fts.search_documents_fts) ASC, sd.note_id ASC
        LIMIT ${peekLimit} OFFSET ${offset}
      `);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      const hits = page.map((row) => this.toHit(row));
      const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

      return { hits, nextCursor };
    });
  }

  async bulkRebuildFromSnapshots(
    documents: AsyncIterable<SearchDocument>,
  ): Promise<void> {
    await mapDbError("Failed to bulk rebuild search index", async () => {
      // Wipe and repopulate so the rebuild is a full snapshot rather
      // than a merge. Triggers keep the FTS index in lockstep on each
      // host-table mutation, so we never touch `search_documents_fts`
      // directly here.
      await this.db.delete(searchDocuments);

      let buffer: ReturnType<D1SearchIndex["toRow"]>[] = [];
      const flush = async () => {
        if (buffer.length === 0) return;
        await this.db.insert(searchDocuments).values(buffer);
        buffer = [];
      };

      for await (const doc of documents) {
        buffer.push(this.toRow(doc));
        if (buffer.length >= BULK_REBUILD_CHUNK_SIZE) {
          await flush();
        }
      }
      await flush();
    });
  }

  private toRow(doc: SearchDocument) {
    return {
      noteId: doc.noteId,
      ownerId: doc.ownerId,
      visibility: doc.visibility,
      title: doc.title,
      bodyPlain: doc.body,
      tagNamesJson: JSON.stringify([...doc.tagNames]),
      directoryPath: doc.directoryPath,
      dateForCalendar: doc.dateForCalendar.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      indexedAt: doc.indexedAt.toISOString(),
    };
  }

  private toHit(row: SearchRow) {
    if (!this.idGenerator.validate(row.noteId)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored search document has malformed noteId: ${row.noteId}`,
      );
    }
    if (!this.idGenerator.validate(row.ownerId)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored search document has malformed ownerId: ${row.ownerId}`,
      );
    }
    let tagNames: readonly string[];
    try {
      const parsed = JSON.parse(row.tagNamesJson);
      if (
        !Array.isArray(parsed) ||
        !parsed.every((t) => typeof t === "string")
      ) {
        throw new Error("tag_names_json is not a string array");
      }
      tagNames = parsed;
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored search document has malformed tag_names_json (noteId=${row.noteId})`,
        error,
      );
    }
    try {
      // bm25() returns negative-or-zero values in SQLite FTS5 where lower
      // is more relevant. Flip the sign so the public `SearchScore`
      // contract (`[0, +∞)`, higher = better) holds, then reuse the same
      // value in the cursor / sort logic upstream.
      const normalisedScore = -row.score;
      return {
        noteId: NoteId.create(row.noteId),
        ownerId: UserId.create(row.ownerId),
        username: Username.create(row.username),
        title: SearchTitle.create(row.title),
        snippet: SearchSnippet.create(row.snippet),
        tagNames,
        score: SearchScore.create(
          Number.isFinite(normalisedScore) && normalisedScore >= 0
            ? normalisedScore
            : 0,
        ),
        visibility: Visibility.create(row.visibility),
      };
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored search document violates invariants",
          error,
        );
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Strips FTS5 metacharacters from a free-text keyword and re-wraps the
// remaining tokens as a phrase query. Without this, a keyword like `foo:`
// or `bar"baz` would be interpreted as an FTS column filter or quoted
// phrase boundary and surface as a parser error from D1.
function buildMatchExpression(keyword: string): string {
  const tokens = keyword
    .split(/\s+/)
    .map((tok) => tok.replace(/["\\]/g, ""))
    .filter((tok) => tok.length > 0);
  if (tokens.length === 0) {
    // Domain guarantees keyword.length >= 1 via `SearchKeyword.create`,
    // but normalisation may strip the entire input (e.g. a single `"`).
    // Fall back to a literal that matches nothing rather than throwing.
    return '""';
  }
  return tokens.map((tok) => `"${tok}"`).join(" ");
}

function encodeCursor(offset: number): SearchCursor {
  // Base64 of `offset:<n>` keeps the cursor opaque to callers while
  // remaining trivially debuggable from logs.
  const payload = `offset:${offset}`;
  return SearchCursor.create(base64UrlEncode(payload));
}

function decodeCursor(cursor: SearchCursor | null): number {
  if (cursor === null) return 0;
  try {
    const decoded = base64UrlDecode(cursor);
    const match = decoded.match(/^offset:(\d+)$/);
    if (match === null) return 0;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function base64UrlEncode(input: string): string {
  // Workers / Node share `btoa` for ASCII input; the cursor payload is
  // always ASCII (`offset:<digits>`), so this is safe without TextEncoder.
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const normalised = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalised.length % 4 === 0 ? "" : "=".repeat(4 - (normalised.length % 4));
  return atob(normalised + padding);
}
