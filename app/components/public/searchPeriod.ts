// P32 period facet helpers shared by the search server component
// (URL `period` → `{from,to}` date range for `searchPublicNotes`) and the
// drawer/active-chip UI (labels). Kept framework-free so it is unit-testable
// and importable from both server and client modules.

export const SEARCH_PERIODS = ["7d", "30d", "1y", "all"] as const;
export type SearchPeriod = (typeof SEARCH_PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors `countPublicSearchFacets`' `PERIOD_LOOKBACK_DAYS`. `all` has no
// lower bound. The two live in different layers (UI vs application) on
// purpose; keep them in lockstep when adding a period.
const PERIOD_LOOKBACK_DAYS: Readonly<Record<SearchPeriod, number | null>> = {
  "7d": 7,
  "30d": 30,
  "1y": 365,
  all: null,
};

export const PERIOD_LABELS: Readonly<Record<SearchPeriod, string>> = {
  "7d": "過去 7 日",
  "30d": "過去 30 日",
  "1y": "過去 1 年",
  all: "すべて",
};

export function isSearchPeriod(value: unknown): value is SearchPeriod {
  return (
    typeof value === "string" &&
    (SEARCH_PERIODS as readonly string[]).includes(value)
  );
}

/**
 * Resolve a `period` token into a `{from,to}` range relative to `now`.
 * Returns `null` for `all` (no date constraint) or an absent period.
 */
export function periodToDateRange(
  period: SearchPeriod | null | undefined,
  now: Date,
): { from: Date; to: Date } | null {
  if (period === null || period === undefined) return null;
  const lookback = PERIOD_LOOKBACK_DAYS[period];
  if (lookback === null) return null;
  return {
    from: new Date(now.getTime() - lookback * DAY_MS),
    to: now,
  };
}
