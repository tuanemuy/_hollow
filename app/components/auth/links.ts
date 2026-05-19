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
 * `satisfies` keeps the constant strongly typed against the schema's
 * pagination slice while preserving the literal types of `page` / `limit`
 * for TanStack Router's `MakeRequiredSearchParams` inference.
 */
import type { NoteListSearch } from "@/components/note/schema";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
} from "@/core/presentation/pagination";

export const HOME_SEARCH = {
  page: PAGINATION_DEFAULT_PAGE,
  limit: PAGINATION_DEFAULT_LIMIT,
} as const satisfies Pick<NoteListSearch, "page" | "limit">;
