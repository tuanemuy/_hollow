import type { NoteId } from "@/core/domain/note/valueObject";
import type { SearchDocument } from "../entity";
import type {
  DateRange,
  SearchCursor,
  SearchHit,
  SearchQuery,
} from "../valueObject";

/**
 * Result page returned by `SearchIndex.query`.
 *
 * `nextCursor === null` means the caller has reached the end of the
 * matching set. The cursor encoding is opaque to the domain — the
 * adapter owns it.
 */
export type SearchQueryResult = Readonly<{
  hits: readonly SearchHit[];
  nextCursor: SearchCursor | null;
}>;

/**
 * Port over the underlying search engine.
 *
 * The Search domain treats the index as an external read-modify-write
 * store; there is no OCC because the index is a derived projection and
 * the upstream Note domain can always rebuild it. Adapters translate
 * driver-level failures into the domain-visible errors
 * `SearchIndexUnavailableError` and `SearchTimeoutError`.
 *
 * `bulkRebuildFromSnapshots` is used by the rebuild worker after
 * schema changes; the adapter implementation streams the iterable so a
 * full rebuild does not need to materialise the corpus in memory.
 */
export interface SearchIndex {
  upsert(doc: SearchDocument): Promise<void>;
  delete(noteId: NoteId): Promise<void>;
  query(q: SearchQuery): Promise<SearchQueryResult>;
  bulkRebuildFromSnapshots(
    documents: AsyncIterable<SearchDocument>,
  ): Promise<void>;

  /**
   * Counts the hits the same `q` would match, once per supplied date
   * window, without paginating. `q.dateRange` is ignored — each entry in
   * `ranges` supplies its own window, and a `null` entry means "no date
   * constraint" (count over the whole matching set). All of `q`'s other
   * filters (keyword, visibility, owner, tags) apply to every count.
   *
   * On the public surface the date window is evaluated against the
   * publication aggregate's `published_at` (公開日), not the note's
   * `date_for_calendar`; the adapter joins `publication_states` for the
   * windowed counts. The same MATCH / LIKE routing as `query` is reused so
   * the counts match what the result list would show.
   *
   * Returns a `number[]` positionally aligned with `ranges`. Used by the
   * public search facet panel (P32) to label each period radio with its
   * result count.
   */
  countByDateRanges(
    q: SearchQuery,
    ranges: readonly (DateRange | null)[],
  ): Promise<readonly number[]>;
}

/**
 * Raised by adapter implementations when the underlying search
 * engine is unreachable. Distinguished from `SearchTimeoutError` so the
 * caller can decide whether to fail open or fall back to a degraded
 * read path.
 */
export class SearchIndexUnavailableError extends Error {
  override readonly name = "SearchIndexUnavailableError";
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export class SearchTimeoutError extends Error {
  override readonly name = "SearchTimeoutError";
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isSearchIndexUnavailableError(
  error: unknown,
): error is SearchIndexUnavailableError {
  return error instanceof SearchIndexUnavailableError;
}

export function isSearchTimeoutError(
  error: unknown,
): error is SearchTimeoutError {
  return error instanceof SearchTimeoutError;
}
