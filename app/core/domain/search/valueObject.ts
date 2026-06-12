import { BusinessRuleError } from "@/core/domain/error";
import type { UserId, Username } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { SearchErrorCode } from "./errorCode";

declare const indexJobIdBrand: unique symbol;
declare const searchKeywordBrand: unique symbol;
declare const searchTitleBrand: unique symbol;
declare const searchBodyBrand: unique symbol;
declare const searchDirectoryPathBrand: unique symbol;
declare const searchSnippetBrand: unique symbol;
declare const searchScoreBrand: unique symbol;
declare const searchCursorBrand: unique symbol;
declare const searchAttemptsBrand: unique symbol;
declare const searchLastErrorBrand: unique symbol;
declare const searchLimitBrand: unique symbol;

const TITLE_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 1024 * 1024;
const DIRECTORY_PATH_MAX_LENGTH = 2048;
const KEYWORD_MIN_LENGTH = 1;
const KEYWORD_MAX_LENGTH = 200;
const SNIPPET_MAX_LENGTH = 1024;
const SEARCH_LIMIT_MIN = 1;
const SEARCH_LIMIT_MAX = 50;
// Upper bound on the number of tag filters a single query may carry.
// Matches the P30 filter-chip cap and the route-boundary `.max(8)`;
// duplicated here as defence-in-depth so a query that bypasses the
// transport schema still cannot amplify the per-tag `LIKE` fan-out.
const TAG_NAMES_MAX_COUNT = 8;
const LAST_ERROR_MAX_LENGTH = 4096;
const SEARCH_CURSOR_MAX_LENGTH = 1024;

/**
 * Opaque identifier for an `IndexJob`. As with other aggregate ids in
 * this template, the domain treats the value as a non-empty string;
 * the id format (UUIDv7) is owned by `IdGenerator` and re-validated by
 * storage adapters on rehydration.
 */
export type IndexJobId = string & { readonly [indexJobIdBrand]: true };

export const IndexJobId = {
  create: (id: string): IndexJobId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        SearchErrorCode.InvalidIndexJobId,
        "Invalid index job id",
      );
    }
    return trimmed as IndexJobId;
  },
};

/**
 * Publication visibility seen from the Search domain.
 *
 * The canonical brand lives in the Publication domain; until it is
 * implemented Search owns this local alias so query filters stay
 * structurally typed. When Publication is implemented, swap this for
 * `import type { Visibility } from "../publication/valueObject"`.
 */
export type Visibility = "private" | "unlisted" | "public";

export const Visibility = {
  create: (raw: string): Visibility => {
    if (raw !== "private" && raw !== "unlisted" && raw !== "public") {
      throw new BusinessRuleError(
        SearchErrorCode.InvalidVisibility,
        `Invalid visibility: ${raw}`,
      );
    }
    return raw;
  },
};

/** `upsert` or `delete` operation for an `IndexJob`. */
export type IndexJobOp = "upsert" | "delete";

export const IndexJobOp = {
  create: (raw: string): IndexJobOp => {
    if (raw !== "upsert" && raw !== "delete") {
      throw new BusinessRuleError(
        SearchErrorCode.InvalidOp,
        `Invalid index job op: ${raw}`,
      );
    }
    return raw;
  },
};

/** Search-document title. Bounded to mirror the upstream `NoteTitle` cap. */
export type SearchTitle = string & { readonly [searchTitleBrand]: true };

export const SearchTitle = {
  create: (raw: string): SearchTitle => {
    if (raw.length > TITLE_MAX_LENGTH) {
      throw new BusinessRuleError(
        SearchErrorCode.TitleTooLong,
        `Search title exceeds maximum length (${TITLE_MAX_LENGTH})`,
      );
    }
    return raw as SearchTitle;
  },
};

/**
 * Plain-text projection of the note body used as the indexed corpus.
 * Bounded so that pathological payloads never reach the index.
 */
export type SearchBody = string & { readonly [searchBodyBrand]: true };

export const SearchBody = {
  create: (raw: string): SearchBody => {
    if (raw.length > BODY_MAX_LENGTH) {
      throw new BusinessRuleError(
        SearchErrorCode.BodyTooLong,
        `Search body exceeds maximum length (${BODY_MAX_LENGTH})`,
      );
    }
    return raw as SearchBody;
  },
};

/**
 * `/`-delimited directory path snapshot. The Search domain treats this
 * as an opaque, length-bounded string — segment validation lives in the
 * Directory domain.
 */
export type SearchDirectoryPath = string & {
  readonly [searchDirectoryPathBrand]: true;
};

export const SearchDirectoryPath = {
  create: (raw: string): SearchDirectoryPath => {
    if (raw.length > DIRECTORY_PATH_MAX_LENGTH) {
      throw new BusinessRuleError(
        SearchErrorCode.DirectoryPathInvalid,
        `Search directory path exceeds maximum length (${DIRECTORY_PATH_MAX_LENGTH})`,
      );
    }
    if (raw.length > 0 && !raw.startsWith("/")) {
      throw new BusinessRuleError(
        SearchErrorCode.DirectoryPathInvalid,
        "Search directory path must start with '/' when non-empty",
      );
    }
    return raw as SearchDirectoryPath;
  },
};

/** Free-text query keyword. 1..200 chars after trimming. */
export type SearchKeyword = string & { readonly [searchKeywordBrand]: true };

export const SearchKeyword = {
  create: (raw: string): SearchKeyword => {
    const trimmed = raw.trim();
    if (trimmed.length < KEYWORD_MIN_LENGTH) {
      throw new BusinessRuleError(
        SearchErrorCode.KeywordEmpty,
        "Search keyword cannot be empty",
      );
    }
    if (trimmed.length > KEYWORD_MAX_LENGTH) {
      throw new BusinessRuleError(
        SearchErrorCode.KeywordTooLong,
        `Search keyword exceeds maximum length (${KEYWORD_MAX_LENGTH})`,
      );
    }
    return trimmed as SearchKeyword;
  },
};

/** Bounded page size for a `SearchQuery`. */
export type SearchLimit = number & { readonly [searchLimitBrand]: true };

export const SearchLimit = {
  create: (raw: number): SearchLimit => {
    if (!Number.isInteger(raw) || raw < SEARCH_LIMIT_MIN) {
      throw new BusinessRuleError(
        SearchErrorCode.LimitOutOfRange,
        `Search limit must be an integer ≥ ${SEARCH_LIMIT_MIN}`,
      );
    }
    if (raw > SEARCH_LIMIT_MAX) {
      throw new BusinessRuleError(
        SearchErrorCode.LimitOutOfRange,
        `Search limit must be ≤ ${SEARCH_LIMIT_MAX}`,
      );
    }
    return raw as SearchLimit;
  },
};

/**
 * Opaque pagination cursor. The Search adapter owns the encoding; the
 * domain treats it as a length-bounded string so adapters cannot be
 * passed arbitrary blobs.
 */
export type SearchCursor = string & { readonly [searchCursorBrand]: true };

export const SearchCursor = {
  create: (raw: string): SearchCursor => {
    if (raw.length === 0) {
      throw new BusinessRuleError(
        SearchErrorCode.InvalidCursor,
        "Search cursor cannot be empty",
      );
    }
    if (raw.length > SEARCH_CURSOR_MAX_LENGTH) {
      throw new BusinessRuleError(
        SearchErrorCode.InvalidCursor,
        `Search cursor exceeds maximum length (${SEARCH_CURSOR_MAX_LENGTH})`,
      );
    }
    return raw as SearchCursor;
  },
};

/**
 * Which timestamp a `dateRange` window is evaluated against.
 *
 * - `'date_for_calendar'` — the note aggregate's `date_for_calendar`
 *   projection, present on every indexed note regardless of visibility.
 *   Used by the own-notes (all-visibility) surface so private / unlisted
 *   notes are not dropped by a publication join. This is the default so
 *   existing call sites keep their original date semantics.
 * - `'published_at'` — the publication aggregate's `published_at` (公開日).
 *   Used by the public surfaces (search / facets) where "期間" means the
 *   公開日 and only `public` notes are in scope. The adapter joins
 *   `publication_states` for this basis.
 */
export type DateBasis = "published_at" | "date_for_calendar";

/**
 * Result ordering for a `SearchQuery`.
 *
 * - `'relevance'` — rank by the index's relevance score (bm25 on the FTS
 *   path; the LIKE fallback has no score and keeps a stable `note_id`
 *   order). This is the default so existing call sites keep their
 *   original ordering.
 * - `'newest'` — order by the index projection's `updated_at`
 *   descending (the same value surfaced as `SearchHit.updatedAt`), with
 *   `note_id` as a stable tie-breaker.
 *
 * `sort` only affects `SearchIndex.query` ordering; count surfaces
 * (`countByDateRanges`) are order-independent.
 */
export type SearchSort = "relevance" | "newest";

/**
 * Half-open `[from, to]` interval used as a query filter.
 * Construction enforces `from <= to`.
 */
export type DateRange = Readonly<{ from: Date; to: Date }>;

export const DateRange = {
  create: (params: { from: Date; to: Date }): DateRange => {
    if (params.from.getTime() > params.to.getTime()) {
      throw new BusinessRuleError(
        SearchErrorCode.InvalidDateRange,
        "DateRange.from must be <= DateRange.to",
      );
    }
    return { from: params.from, to: params.to };
  },
};

/** Highlighted excerpt rendered in a `SearchHit`. Bounded. */
export type SearchSnippet = string & { readonly [searchSnippetBrand]: true };

export const SearchSnippet = {
  create: (raw: string): SearchSnippet => {
    if (raw.length > SNIPPET_MAX_LENGTH) {
      throw new BusinessRuleError(
        SearchErrorCode.SnippetTooLong,
        `Search snippet exceeds maximum length (${SNIPPET_MAX_LENGTH})`,
      );
    }
    return raw as SearchSnippet;
  },
};

/** Relevance score in `[0, +∞)`. NaN / negative / non-finite are rejected. */
export type SearchScore = number & { readonly [searchScoreBrand]: true };

export const SearchScore = {
  create: (raw: number): SearchScore => {
    if (!Number.isFinite(raw) || raw < 0) {
      throw new BusinessRuleError(
        SearchErrorCode.InvalidScore,
        `Invalid search score: ${raw}`,
      );
    }
    return raw as SearchScore;
  },
};

/** Non-negative integer retry counter for `IndexJob`. */
export type IndexJobAttempts = number & {
  readonly [searchAttemptsBrand]: true;
};

export const IndexJobAttempts = {
  zero: (): IndexJobAttempts => 0 as IndexJobAttempts,
  create: (raw: number): IndexJobAttempts => {
    if (!Number.isInteger(raw) || raw < 0) {
      throw new BusinessRuleError(
        SearchErrorCode.InvalidAttempts,
        `Invalid index job attempts: ${raw}`,
      );
    }
    return raw as IndexJobAttempts;
  },
  next: (a: IndexJobAttempts): IndexJobAttempts =>
    ((a as number) + 1) as IndexJobAttempts,
};

/**
 * Last-error string captured on a failed dispatch. Bounded so a runaway
 * stack trace cannot bloat the queue row.
 */
export type IndexJobLastError = string & {
  readonly [searchLastErrorBrand]: true;
};

export const IndexJobLastError = {
  create: (raw: string): IndexJobLastError => {
    if (raw.length > LAST_ERROR_MAX_LENGTH) {
      // Truncate rather than throw: the consumer wants the head of the
      // trace, and rejecting the row would just send it back through
      // another retry that fails the same way.
      return raw.slice(0, LAST_ERROR_MAX_LENGTH) as IndexJobLastError;
    }
    return raw as IndexJobLastError;
  },
};

/**
 * Query parameters fed into the search index.
 *
 * Each leaf has its own brand so a usecase cannot accidentally swap
 * `keyword` and `cursor` at a call site. `runQuery` accepts the
 * already-validated record; the input edge constructs it through
 * `SearchQuery.create`.
 */
export type SearchQuery = Readonly<{
  keyword: SearchKeyword;
  ownerIdFilter: UserId | null;
  visibilityFilter: readonly Visibility[];
  tagNames: readonly string[];
  directoryPathPrefix: SearchDirectoryPath | null;
  dateRange: DateRange | null;
  // Which timestamp `dateRange` is evaluated against. The own-notes
  // (all-visibility) surface uses `date_for_calendar`; the public surfaces
  // (search / facets) use `published_at`. Defaults to `date_for_calendar`
  // so the basis is opt-in per surface.
  dateBasis: DateBasis;
  // Result ordering. Defaults to `'relevance'` so existing surfaces are
  // unaffected; only the public search surface (P32) exposes `'newest'`.
  sort: SearchSort;
  limit: SearchLimit;
  cursor: SearchCursor | null;
}>;

export const SearchQuery = {
  create: (params: {
    keyword: string;
    ownerIdFilter: UserId | null;
    visibilityFilter: readonly string[];
    tagNames: readonly string[];
    directoryPathPrefix: string | null;
    dateRange: { from: Date; to: Date } | null;
    dateBasis?: DateBasis | undefined;
    sort?: SearchSort | undefined;
    limit: number;
    cursor: string | null;
  }): SearchQuery => {
    return {
      keyword: SearchKeyword.create(params.keyword),
      ownerIdFilter: params.ownerIdFilter,
      visibilityFilter: params.visibilityFilter.map((v) =>
        Visibility.create(v),
      ),
      // Defence-in-depth length clamp: the transport boundary already
      // caps `tags` at `.max(8)`, but slicing here guards any call site
      // that bypasses it from fanning out an unbounded per-tag `LIKE`.
      tagNames: params.tagNames.slice(0, TAG_NAMES_MAX_COUNT),
      directoryPathPrefix:
        params.directoryPathPrefix === null
          ? null
          : SearchDirectoryPath.create(params.directoryPathPrefix),
      dateRange:
        params.dateRange === null ? null : DateRange.create(params.dateRange),
      dateBasis: params.dateBasis ?? "date_for_calendar",
      sort: params.sort ?? "relevance",
      limit: SearchLimit.create(params.limit),
      cursor:
        params.cursor === null ? null : SearchCursor.create(params.cursor),
    };
  },
};

/**
 * Single result row returned by `SearchIndex.query`.
 *
 * `updatedAt` comes from the search index (`search_documents.updated_at`)
 * and is therefore eventually consistent with the Note aggregate.
 */
export type SearchHit = Readonly<{
  noteId: NoteId;
  ownerId: UserId;
  username: Username;
  title: SearchTitle;
  snippet: SearchSnippet;
  tagNames: readonly string[];
  score: SearchScore;
  visibility: Visibility;
  updatedAt: Date;
}>;
