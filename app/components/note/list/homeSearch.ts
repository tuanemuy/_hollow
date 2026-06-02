import type { NoteListSearch } from "../schema";

/**
 * Builds the `search` updater payload for `router.navigate({ to: "/" })` on
 * the home / note-list route: spread the previous search, then overlay `patch`
 * (patch wins, so `undefined` values intentionally clear a field).
 *
 * `prev` is typed `unknown` because unifying `validateSearch` to
 * `(search) => noteListSearchSchema.parse(search)` makes TanStack Router widen
 * the updater's argument to a cross-route search union (Issue #13 CQ-W-005 /
 * Issue #74). The cast to `Partial<NoteListSearch>` is unavoidable but lives
 * here in one place instead of being repeated at every callsite.
 */
export function homeSearchUpdater(
  prev: unknown,
  patch: Partial<NoteListSearch>,
): Partial<NoteListSearch> {
  return { ...(prev as Partial<NoteListSearch>), ...patch };
}
