import { z } from "zod";
import type { Pagination } from "@/core/domain/common/pagination";

export const PAGINATION_MAX_LIMIT = 100;
export const PAGINATION_MAX_PAGE = 10_000;
export const PAGINATION_DEFAULT_PAGE = 1;
export const PAGINATION_DEFAULT_LIMIT = 20;

// Field-level base validators are the single source of truth for the
// transport-boundary domain-of-input (int, min, max). Both the strict
// RPC schema and the URL search schema derive from these, so the
// ceilings cannot drift between routes and server functions.
const pageField = z.number().int().min(1).max(PAGINATION_MAX_PAGE);
const limitField = z.number().int().min(1).max(PAGINATION_MAX_LIMIT);

// Strict numeric schema for server-function `inputValidator`. RPC payloads
// arrive already typed (JSON), so no coercion is needed; bad payloads must
// fail loud rather than silently fall back to defaults.
export const paginationSchema = z.object({
  page: pageField,
  limit: limitField,
});

// URL search variant for `validateSearch`. `z.coerce` adapts the stringly-
// typed URL inputs; `.pipe(field)` reuses the exact same constraints; and
// `.catch(undefined)` ensures a hand-typed `?page=abc` never errors the
// route. `.optional()` keeps both input and output sides accepting
// omission, so `<Link to="/trash" search={{}}>` does not serialise the
// default pagination into the URL (Issue #215). Consumers re-default at
// the loader boundary via `?? PAGINATION_DEFAULT_*`.
export const paginationSearchSchema = z.object({
  page: z.coerce.number().pipe(pageField).optional().catch(undefined),
  limit: z.coerce.number().pipe(limitField).optional().catch(undefined),
});

// Structural compatibility checks. The strict RPC schema must satisfy
// the domain `Pagination` contract (both fields are required there);
// the URL search schema's output is intentionally loose — `page` /
// `limit` may be missing because the loader re-defaults at the
// boundary (Issue #215).
type _PaginationSchemaMatches =
  z.infer<typeof paginationSchema> extends Pagination ? true : never;

// Issue #215 guard: pin that `paginationSearchSchema`'s output keeps
// `page` / `limit` **truly optional**. If a future change re-adds
// `.default(...)` (which would resurrect the `?page=1&limit=20` URL),
// `{}` would no longer extend the output and this check would fail.
type _PaginationSearchSchemaIsPartial =
  Record<string, never> extends z.infer<typeof paginationSearchSchema>
    ? true
    : never;

const _paginationSchemaMatches: _PaginationSchemaMatches = true;
const _paginationSearchSchemaIsPartial: _PaginationSearchSchemaIsPartial = true;
void _paginationSchemaMatches;
void _paginationSearchSchemaIsPartial;
