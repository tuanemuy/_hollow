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
  type DateBasis,
  type DateRange,
  SearchCursor,
  SearchHighlightedTitle,
  type SearchQuery,
  SearchScore,
  SearchSnippet,
  type SearchSort,
  Visibility,
} from "@/core/domain/search/valueObject";
import type { Database } from "./client";
import { escapeLikePattern, mapDbError } from "./repositories/helpers";
import { searchDocuments } from "./schema";

const BULK_REBUILD_CHUNK_SIZE = 100;
const SNIPPET_TOKEN_BUDGET = 24;
// Fixed-length body excerpt for the LIKE fallback path, which cannot use
// FTS5's `snippet()`. Stays well under `SearchSnippet`'s 1024 cap.
// Unit caveat: SQLite `substr` counts characters (codepoint-equivalent),
// but the 1024 cap is JS UTF-16 code units. When raising this toward the
// cap, budget for up to 2x (surrogate pairs).
const LIKE_SNIPPET_CHARS = 160;

type SearchRow = Readonly<{
  noteId: string;
  ownerId: string;
  username: string;
  title: string;
  snippet: string;
  tagNamesJson: string;
  visibility: string;
  score: number;
  updatedAt: string;
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
 * and `users` (for the hit's `username`). `bm25()` ranks results;
 * `snippet()` produces the highlighted body excerpt (col 1) and
 * `highlight()` marks the matched runs in the title (col 0). Both honour
 * `SearchQuery.highlight`: when it is `false` the markers are dropped
 * (empty `snippet()` markers, raw `sd.title`) so a surface that renders the
 * strings plainly (P30 own-notes) never receives raw `<mark>` text.
 *
 * `search_documents_fts` uses `tokenize='trigram'` (migration 0008) so
 * CJK and ASCII free-text queries share one substring-match path — the
 * default `unicode61` tokenizer collapses contiguous CJK runs into one
 * token and breaks partial-match for keywords like `デザイン`.
 *
 * Trigram has one essential constraint: query tokens shorter than 3
 * Unicode codepoints cannot match anything. The domain's `SearchKeyword`
 * still accepts 1+ chars; the gap is absorbed in the adapter rather than
 * leaking into the domain contract. `extractTrigramTokens` keeps only the
 * tokens trigram can index (3+ codepoints). When at least one such token
 * survives, the MATCH path runs (shorter tokens in a mixed query are
 * ignored, as before). When *every* token is shorter than 3 codepoints,
 * the adapter falls back to a LIKE substring search directly against the
 * host table `search_documents` (title / body_plain / tag_names_json),
 * so practical short keywords (`AI` / `Go` / `本` / `🎨`) still match.
 * The fallback cannot use `snippet()` / `bm25()`, so it returns a
 * body_plain head excerpt, a fixed score of 0, and a stable `note_id ASC`
 * order instead of relevance ranking and highlighted snippets.
 *
 * `SearchQuery.sort` selects the ORDER BY: `'relevance'` keeps the orders
 * above; `'newest'` sorts both paths by `sd.updated_at DESC` with
 * `sd.note_id ASC` as a stable tie-breaker so offset pagination stays
 * deterministic.
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

      // One extra row over the requested limit so we can compute
      // `nextCursor` without an additional COUNT round trip.
      const peekLimit = limit + 1;

      const sharedFilters = buildSharedFilters(q);
      // A date window on the public surface (`dateBasis === 'published_at'`)
      // is evaluated against the publication aggregate's `published_at`, so
      // the query joins `publication_states` to expose `ps.published_at`.
      // The own-notes surface uses
      // `dateBasis === 'date_for_calendar'`, which lives on `sd` and needs no
      // join — joining would drop private / unlisted notes that lack a public
      // publication row.
      const joinPublication =
        q.dateRange !== null && q.dateBasis === "published_at";
      const tokens = extractTrigramTokens(q.keyword);
      const rows =
        tokens.length > 0
          ? await this.runMatchQuery(
              buildMatchExpression(tokens),
              sharedFilters,
              peekLimit,
              offset,
              joinPublication,
              q.sort,
              q.highlight,
            )
          : await this.runLikeQuery(
              q.keyword,
              sharedFilters,
              peekLimit,
              offset,
              joinPublication,
              q.sort,
            );

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      const hits = page.map((row) => this.toHit(row));
      const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

      return { hits, nextCursor };
    });
  }

  private async runMatchQuery(
    matchExpr: string,
    sharedFilters: readonly ReturnType<typeof sql>[],
    peekLimit: number,
    offset: number,
    joinPublication: boolean,
    sort: SearchSort,
    highlight: boolean,
  ): Promise<SearchRow[]> {
    // FTS contentless table joins back to the host via the implicit
    // `rowid` column (configured `content_rowid='rowid'` in the migration's
    // FTS5 DDL). Comparing `sd.note_id` (text UUID) against `fts.rowid`
    // (integer) silently produces zero rows on every query.
    const whereClause = sql.join(
      [
        sql`sd.rowid = fts.rowid`,
        sql`fts.search_documents_fts MATCH ${matchExpr}`,
        ...sharedFilters,
      ],
      sql` AND `,
    );

    // Title uses `highlight()` (col 0 = title in migration 0008) rather than
    // `snippet()`: titles are short and shown whole, so we want full-text
    // marking, not token-budget truncation. The snippet keeps `snippet()`
    // over the body (col 1). When `highlight` is false both are emitted
    // without markers so a plain-rendering surface never receives raw text.
    const titleSelect = highlight
      ? sql`highlight(fts.search_documents_fts, 0, '<mark>', '</mark>')`
      : sql`sd.title`;
    const snippetSelect = highlight
      ? sql`snippet(fts.search_documents_fts, 1, '<mark>', '</mark>', '…', ${SNIPPET_TOKEN_BUDGET})`
      : sql`snippet(fts.search_documents_fts, 1, '', '', '…', ${SNIPPET_TOKEN_BUDGET})`;

    return this.db.all<SearchRow>(sql`
      SELECT
        sd.note_id      AS "noteId",
        sd.owner_id     AS "ownerId",
        u.username      AS "username",
        ${titleSelect}  AS "title",
        ${snippetSelect} AS "snippet",
        sd.tag_names_json AS "tagNamesJson",
        sd.visibility   AS "visibility",
        bm25(fts.search_documents_fts) AS "score",
        sd.updated_at   AS "updatedAt"
      FROM search_documents_fts AS fts
      JOIN search_documents AS sd
      JOIN users AS u ON u.id = sd.owner_id
      ${publicationJoin(joinPublication)}
      WHERE ${whereClause}
      ORDER BY ${buildOrderBy(sort, sql`bm25(fts.search_documents_fts) ASC, sd.note_id ASC`)}
      LIMIT ${peekLimit} OFFSET ${offset}
    `);
  }

  private async runLikeQuery(
    keyword: string,
    sharedFilters: readonly ReturnType<typeof sql>[],
    peekLimit: number,
    offset: number,
    joinPublication: boolean,
    sort: SearchSort,
  ): Promise<SearchRow[]> {
    // Fallback for keywords whose every token is shorter than the trigram
    // minimum (3 codepoints). Searches the host table directly with a
    // substring LIKE over the same three columns the FTS index covers.
    // `escapeLikePattern` neutralises `%` / `_` / `\\` so the user keyword
    // matches literally. The `%keyword%` match on `tag_names_json` is plain
    // substring (free-text), distinct from the MATCH path's quoted tag
    // *filter* (`%"<tag>"%`).
    const likeClause = buildLikeKeywordClause(keyword);
    const whereClause = sql.join([likeClause, ...sharedFilters], sql` AND `);

    return this.db.all<SearchRow>(sql`
      SELECT
        sd.note_id      AS "noteId",
        sd.owner_id     AS "ownerId",
        u.username      AS "username",
        sd.title        AS "title",
        substr(sd.body_plain, 1, ${LIKE_SNIPPET_CHARS}) AS "snippet",
        sd.tag_names_json AS "tagNamesJson",
        sd.visibility   AS "visibility",
        0               AS "score",
        sd.updated_at   AS "updatedAt"
      FROM search_documents AS sd
      JOIN users AS u ON u.id = sd.owner_id
      ${publicationJoin(joinPublication)}
      WHERE ${whereClause}
      ORDER BY ${buildOrderBy(sort, sql`sd.note_id ASC`)}
      LIMIT ${peekLimit} OFFSET ${offset}
    `);
  }

  async countByDateRanges(
    q: SearchQuery,
    ranges: readonly (DateRange | null)[],
  ): Promise<readonly number[]> {
    return mapDbError("Failed to count search facets", async () => {
      // `q.dateRange` is intentionally ignored here — each `ranges` entry
      // supplies its own window. The non-date filters (owner / visibility /
      // tags) are shared across every count.
      const baseFilters = buildNonDateFilters(q);
      const tokens = extractTrigramTokens(q.keyword);
      const useMatch = tokens.length > 0;
      const matchExpr = useMatch ? buildMatchExpression(tokens) : null;
      const keywordClause = useMatch ? null : buildLikeKeywordClause(q.keyword);

      // Counts run sequentially rather than as one CASE-pivot query: the
      // FTS MATCH path joins the contentless virtual table, so a single
      // pivoted aggregate over all windows would need a more delicate
      // sub-query shape than 4 bounded COUNTs. The facet panel is capped at
      // a handful of windows (`SearchLimit` is unrelated), so the round
      // trips are cheap and the SQL stays readable.
      const counts: number[] = [];
      for (const range of ranges) {
        const dateClause =
          range === null ? null : buildDateRangeClause(range, q.dateBasis);
        const extraFilters = dateClause === null ? [] : [dateClause];
        // A `published_at`-based window joins `publication_states` to expose
        // `ps.published_at`; a `date_for_calendar`-based window stays on `sd`
        // and needs no join. Mirrors the `query` path gate.
        const joinPublication =
          dateClause !== null && q.dateBasis === "published_at";
        const count =
          matchExpr !== null
            ? await this.countMatch(
                matchExpr,
                [...baseFilters, ...extraFilters],
                joinPublication,
              )
            : await this.countLike(
                keywordClause as ReturnType<typeof sql>,
                [...baseFilters, ...extraFilters],
                joinPublication,
              );
        counts.push(count);
      }
      return counts;
    });
  }

  private async countMatch(
    matchExpr: string,
    filters: readonly ReturnType<typeof sql>[],
    joinPublication: boolean,
  ): Promise<number> {
    const whereClause = sql.join(
      [
        sql`sd.rowid = fts.rowid`,
        sql`fts.search_documents_fts MATCH ${matchExpr}`,
        ...filters,
      ],
      sql` AND `,
    );
    const rows = await this.db.all<{ count: number }>(sql`
      SELECT COUNT(*) AS "count"
      FROM search_documents_fts AS fts
      JOIN search_documents AS sd
      ${publicationJoin(joinPublication)}
      WHERE ${whereClause}
    `);
    return Number(rows[0]?.count ?? 0);
  }

  private async countLike(
    keywordClause: ReturnType<typeof sql>,
    filters: readonly ReturnType<typeof sql>[],
    joinPublication: boolean,
  ): Promise<number> {
    const whereClause = sql.join([keywordClause, ...filters], sql` AND `);
    const rows = await this.db.all<{ count: number }>(sql`
      SELECT COUNT(*) AS "count"
      FROM search_documents AS sd
      ${publicationJoin(joinPublication)}
      WHERE ${whereClause}
    `);
    return Number(rows[0]?.count ?? 0);
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
    const updatedAt = new Date(row.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored search document has malformed updated_at (noteId=${row.noteId})`,
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
        title: SearchHighlightedTitle.create(row.title),
        snippet: SearchSnippet.create(row.snippet),
        tagNames,
        score: SearchScore.create(
          Number.isFinite(normalisedScore) && normalisedScore >= 0
            ? normalisedScore
            : 0,
        ),
        visibility: Visibility.create(row.visibility),
        updatedAt,
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

// Strips FTS5 metacharacters from a free-text keyword and keeps only the
// tokens trigram can index. Without the metacharacter strip, a keyword
// like `foo:` or `bar"baz` would be interpreted as an FTS column filter or
// quoted phrase boundary and surface as a parser error from D1.
//
// `tokenize='trigram'` (see class JSDoc) cannot match query tokens shorter
// than 3 Unicode codepoints. We absorb that constraint here rather than in
// the domain by dropping short tokens after metacharacter normalisation.
// The length check uses `Array.from(tok).length` to count Unicode
// codepoints — `tok.length` returns UTF-16 code units, which would count
// a surrogate-pair emoji (1 codepoint) as 2 and misclassify it as a valid
// trigram token. When this returns an empty array (every token dropped, or
// the input normalised to nothing), `query` routes to the LIKE fallback.
function extractTrigramTokens(keyword: string): string[] {
  return keyword
    .split(/\s+/)
    .map((tok) => tok.replace(/["\\]/g, ""))
    .filter((tok) => tok.length > 0)
    .filter((tok) => Array.from(tok).length >= 3);
}

// Re-wraps the surviving trigram tokens as a phrase query for `MATCH`.
function buildMatchExpression(tokens: readonly string[]): string {
  return tokens.map((tok) => `"${tok}"`).join(" ");
}

// Non-FTS filters shared by the MATCH and LIKE paths. Every clause
// references `sd.` columns only, so it is independent of the FTS virtual
// table and reusable across both query routes.
function buildSharedFilters(q: SearchQuery): ReturnType<typeof sql>[] {
  const filterClauses = buildNonDateFilters(q);
  if (q.dateRange !== null) {
    filterClauses.push(buildDateRangeClause(q.dateRange, q.dateBasis));
  }
  return filterClauses;
}

// The shared-filter clauses minus the `dateRange` window. Split out so
// `countByDateRanges` can reuse owner / visibility / tag / directory
// filters while substituting its own per-facet date window.
function buildNonDateFilters(q: SearchQuery): ReturnType<typeof sql>[] {
  const filterClauses: ReturnType<typeof sql>[] = [];

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

  return filterClauses;
}

// Date window clause, evaluated against the column selected by `basis`:
//   - `'published_at'`  → the publication aggregate's `ps.published_at`
//     (公開日). The public surfaces use this; callers must pair it with
//     {@link publicationJoin} so `ps` resolves.
//   - `'date_for_calendar'` → the note projection's `sd.date_for_calendar`,
//     present on every indexed note regardless of visibility. The own-notes
//     (all-visibility) surface uses this so private / unlisted notes are not
//     dropped by a publication join.
// Both stored columns are ISO8601 strings, so lexical comparison is
// chronological.
function buildDateRangeClause(
  range: DateRange,
  basis: DateBasis,
): ReturnType<typeof sql> {
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const column =
    basis === "published_at" ? sql`ps.published_at` : sql`sd.date_for_calendar`;
  return sql`${column} >= ${fromIso} AND ${column} <= ${toIso}`;
}

// FROM-clause fragment that joins `publication_states AS ps` on the note id
// so a `ps.published_at` date window resolves. Emitted only when a
// `published_at`-based date window is present (the `visibility = 'public'`
// gate already lives on the `sd` side, so this join exists purely to expose
// `published_at`). The own-notes `date_for_calendar` window stays on `sd` and
// passes `false` here. Returns empty SQL otherwise so the non-join path stays
// a plain `sd` scan.
function publicationJoin(joinPublication: boolean): ReturnType<typeof sql> {
  return joinPublication
    ? sql`JOIN publication_states AS ps ON ps.note_id = sd.note_id`
    : sql``;
}

// ORDER BY body selected by `SearchQuery.sort`. `'newest'` is shared by the
// MATCH and LIKE paths (`updated_at` is an ISO8601 string, so lexical DESC is
// reverse-chronological; `note_id` keeps offset pagination stable across
// ties). `'relevance'` keeps each path's own order, passed in as
// `relevanceOrder` (bm25 on MATCH; stable `note_id` on LIKE, which has no
// score).
function buildOrderBy(
  sort: SearchSort,
  relevanceOrder: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  return sort === "newest"
    ? sql`sd.updated_at DESC, sd.note_id ASC`
    : relevanceOrder;
}

// The LIKE-fallback free-text clause, factored out of `runLikeQuery` so the
// facet COUNT path can reuse the exact same substring match over the three
// indexed columns.
function buildLikeKeywordClause(keyword: string): ReturnType<typeof sql> {
  const needle = `%${escapeLikePattern(keyword.trim())}%`;
  return sql`(
    sd.title LIKE ${needle} ESCAPE '\\'
    OR sd.body_plain LIKE ${needle} ESCAPE '\\'
    OR sd.tag_names_json LIKE ${needle} ESCAPE '\\'
  )`;
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
