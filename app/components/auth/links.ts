/**
 * Shared `search` payload for `<Link to="/">` / `redirect({ to: "/" })` /
 * `router.navigate({ to: "/" })`.
 *
 * The home route validates `search` via `noteListSearchSchema.parse`
 * (Issue #13 ADR-001), so every caller that targets `/` must pass a
 * `search` shape compatible with the schema's defaults. Centralise it
 * here so the literal stays in lockstep with the schema and a future
 * field addition has a single update point.
 *
 * `limit` reads `NOTE_LIST_LIMIT_DEFAULT` directly from the schema's
 * SSOT (`@/components/note/constants`) so the home navigation default
 * cannot drift from the value `noteListSearchSchema.limit` would have
 * filled in via `.default()`.
 *
 * `satisfies` keeps the constant strongly typed against the schema's
 * pagination slice while preserving the literal types of `page` / `limit`
 * for TanStack Router's `MakeRequiredSearchParams` inference.
 */
import { NOTE_LIST_LIMIT_DEFAULT } from "@/components/note/constants";
import type { NoteListSearch } from "@/components/note/schema";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
} from "@/core/presentation/pagination";

export const HOME_SEARCH = {
  page: 1,
  limit: NOTE_LIST_LIMIT_DEFAULT,
} as const satisfies Pick<NoteListSearch, "page" | "limit">;

/**
 * Shared `search` payload for `<Link to="/trash">` / `redirect({ to: "/trash" })`.
 *
 * `/trash` validates `search` via `paginationSearchSchema.parse`, so callers
 * must pass a `search` shape compatible with `paginationSearchSchema` defaults.
 * Same SSOT discipline as {@link HOME_SEARCH}: a single update point keeps the
 * link-side defaults in sync with the schema's `.catch()` fallbacks.
 */
export const TRASH_SEARCH = {
  page: PAGINATION_DEFAULT_PAGE,
  limit: PAGINATION_DEFAULT_LIMIT,
} as const;

/**
 * Shared `search` payload for `<Link to="/notes/$noteId/history">` and
 * navigation to the note-history listing route. Mirrors {@link HOME_SEARCH}
 * /  {@link TRASH_SEARCH}: a single source of truth for the schema
 * defaults so links and the route's `.default()` cannot drift.
 *
 * Numbers are kept aligned with `noteHistorySearchSchema` in
 * `@/components/note/schema` (page=1, limit=20).
 */
export const NOTE_HISTORY_SEARCH = {
  page: 1,
  limit: 20,
} as const;
