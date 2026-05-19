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

export const HOME_SEARCH = {
  page: 1,
  limit: NOTE_LIST_LIMIT_DEFAULT,
} as const satisfies Pick<NoteListSearch, "page" | "limit">;
