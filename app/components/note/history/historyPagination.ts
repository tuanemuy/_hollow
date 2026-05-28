import {
  NOTE_HISTORY_DEFAULT_LIMIT,
  NOTE_HISTORY_DEFAULT_PAGE,
} from "../schema";

/**
 * Issue #215: build the `search` payload for `<Link to="/notes/$noteId/history">`
 * page-navigation links. Default-equal values are dropped so the URL
 * stays clean — the route's `noteHistorySearchSchema` re-defaults the
 * missing keys at parse time, and the loader supplies concrete
 * fallbacks to the server fn.
 *
 * Lives outside `NoteHistoryList.tsx` so the normalisation is unit-
 * testable without rendering an async server component.
 */
export function historyNavSearch(
  nextPage: number,
  limit: number,
): { page?: number; limit?: number } {
  return {
    ...(nextPage === NOTE_HISTORY_DEFAULT_PAGE ? {} : { page: nextPage }),
    ...(limit === NOTE_HISTORY_DEFAULT_LIMIT ? {} : { limit }),
  };
}
