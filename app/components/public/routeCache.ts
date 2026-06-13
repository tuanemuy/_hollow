// Public routes have no invalidate path for anonymous visitors (they never
// mutate, so nothing calls `routerInvalidate()`). With `staleTime: Infinity`
// the cache would otherwise never go stale, so `gcTime` bounds how long a
// cached page survives after unmount — that is the upper bound on how long a
// server-side update can stay hidden from a returning visitor. Shared by the 4
// public routes so the bound can be tuned in one place.
export const PUBLIC_ROUTE_GC_TIME = 60_000;
