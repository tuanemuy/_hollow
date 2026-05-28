/**
 * Shared `search` payload for `<Link to="/">` / `redirect({ to: "/" })` /
 * `router.navigate({ to: "/" })`.
 *
 * Issue #215: emptied — `page` / `limit` are dropped so callers never
 * serialize the default pagination into the URL. The home route's
 * `noteListSearchSchema` already declares `page` / `limit` as
 * `.optional().catch(undefined).default(N)`, so omitting them from the
 * `search` payload still produces the same parsed values, while the
 * URL stays clean (no `?page=1&limit=20`).
 *
 * Kept as a named constant (instead of being inlined or removed) so the
 * 30+ existing call sites continue to compile and the intent — "navigate
 * to home with no extra search" — remains greppable.
 */
export const HOME_SEARCH = {} as const;

/**
 * Shared `search` payload for `<Link to="/trash">` / `redirect({ to: "/trash" })`.
 *
 * Issue #215: same rationale as {@link HOME_SEARCH}. `paginationSearchSchema`
 * is input-optional for `page` / `limit`, so leaving them out keeps the URL
 * free of default values while the parsed output still carries the schema
 * defaults.
 */
export const TRASH_SEARCH = {} as const;

/**
 * Shared `search` payload for `<Link to="/notes/$noteId/history">` and
 * navigation to the note-history listing route.
 *
 * Issue #215: same rationale as {@link HOME_SEARCH}. `noteHistorySearchSchema`
 * already declares `page` / `limit` as `.optional().catch(undefined).default(N)`,
 * so the empty payload yields the same parsed defaults without polluting
 * the URL.
 */
export const NOTE_HISTORY_SEARCH = {} as const;
