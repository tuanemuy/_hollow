import type { NoteId } from "@/core/domain/note/valueObject";
import { type NoteSnapshot, SearchDocument } from "./entity";
import type { SearchIndex, SearchQueryResult } from "./ports/searchIndex";
import type { SearchQuery } from "./valueObject";

/**
 * `SearchService` orchestrates the small set of operations that the
 * Search domain owns end-to-end:
 *
 * - project a `NoteSnapshot` into a `SearchDocument` and hand it to
 *   the index (`applyUpsert`)
 * - tombstone a document by `NoteId` (`applyDelete`)
 * - run a validated `SearchQuery` against the index (`runQuery`)
 *
 * The service is stateless — `now` and the `SearchIndex` port are
 * passed in by the caller so the domain stays free of ambient clock
 * and I/O. Adapter-level errors surface as
 * `SearchIndexUnavailableError` / `SearchTimeoutError` and flow
 * unchanged through to the application layer.
 */
export const SearchService = {
  /**
   * Projects `snapshot` into a `SearchDocument` and upserts it. Idempotent
   * on `noteId` — re-applying the same snapshot is safe (the index
   * adapter is expected to overwrite by primary key).
   */
  async applyUpsert(
    snapshot: NoteSnapshot,
    index: SearchIndex,
    now: Date,
  ): Promise<void> {
    const doc = SearchDocument.fromSnapshot(snapshot, now);
    await index.upsert(doc);
  },

  /**
   * Removes the document for `noteId` from the index. Idempotent —
   * deleting a non-existent row is a no-op at the adapter level.
   */
  async applyDelete(noteId: NoteId, index: SearchIndex): Promise<void> {
    await index.delete(noteId);
  },

  /**
   * Runs `query` against `index`. The caller is expected to pass a
   * `SearchQuery` already constructed through `SearchQuery.create`, so
   * the service trusts the static type and forwards directly.
   */
  async runQuery(
    query: SearchQuery,
    index: SearchIndex,
  ): Promise<SearchQueryResult> {
    return index.query(query);
  },
};
