/**
 * Shared link parameters for the public auth flows.
 *
 * The home route (`/`) declares `paginationSearchSchema` via
 * `validateSearch`, so every `<Link to="/">` / `router.navigate({ to: "/" })`
 * must carry compatible `search` values even when the caller does not
 * care about pagination. Centralise the default here so callers do not
 * hand-roll the shape (and so the literal stays in lockstep with
 * `paginationSearchSchema`'s defaults).
 */
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
} from "@/core/presentation/pagination";

export const HOME_SEARCH = {
  page: PAGINATION_DEFAULT_PAGE,
  limit: PAGINATION_DEFAULT_LIMIT,
} as const;
