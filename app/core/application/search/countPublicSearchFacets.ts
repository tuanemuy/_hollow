import { type UserId, Username } from "@/core/domain/identity/valueObject";
import { SearchService } from "@/core/domain/search/service";
import { DateRange, SearchQuery } from "@/core/domain/search/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

/** Period facets shown in the P32 filter drawer, in display order. */
export const SEARCH_PERIODS = ["7d", "30d", "1y", "all"] as const;
export type SearchPeriod = (typeof SEARCH_PERIODS)[number];

export type CountPublicSearchFacetsInput = Readonly<{
  keyword: string;
  tagNames?: readonly string[];
  username?: string | null;
}>;

export type SearchPeriodFacetDTO = Readonly<{
  period: SearchPeriod;
  count: number;
}>;

export type CountPublicSearchFacetsOutput = Readonly<{
  facets: readonly SearchPeriodFacetDTO[];
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

// How far back each rolling window reaches from `now`. `all` has no lower
// bound and is represented as a `null` range to the index.
const PERIOD_LOOKBACK_DAYS: Readonly<Record<SearchPeriod, number | null>> = {
  "7d": 7,
  "30d": 30,
  "1y": 365,
  all: null,
};

/**
 * Per-period result counts for the public search facet panel (P32).
 *
 * Mirrors `searchPublicNotes`' filters (visibility locked to `public`,
 * optional author + tag narrowing) but, instead of paginating, returns the
 * hit count for each rolling period (past 7 days / 30 days / 1 year / all).
 * An empty keyword short-circuits to all-zero counts so the drawer can
 * render before the user has typed.
 *
 * Each rolling window is evaluated against the publication aggregate's
 * `published_at` (公開日), not the note's `date_for_calendar`; the adapter
 * joins `publication_states` for the windowed counts (ADR-003).
 *
 * The date windows are computed from `container.clock` so the usecase stays
 * deterministic under test.
 */
export async function countPublicSearchFacets({
  container,
  input,
}: ServiceArgs<CountPublicSearchFacetsInput>): Promise<CountPublicSearchFacetsOutput> {
  if (input.keyword.trim().length === 0) {
    return {
      facets: SEARCH_PERIODS.map((period) => ({ period, count: 0 })),
    };
  }

  const ownerIdFilter = await resolveOwnerIdFilter(container, input);
  const now = container.clock.now();

  const ranges = SEARCH_PERIODS.map((period) => {
    const lookback = PERIOD_LOOKBACK_DAYS[period];
    if (lookback === null) return null;
    return DateRange.create({
      from: new Date(now.getTime() - lookback * DAY_MS),
      to: now,
    });
  });

  const query = SearchQuery.create({
    keyword: input.keyword,
    ownerIdFilter,
    visibilityFilter: ["public"],
    tagNames: input.tagNames ?? [],
    directoryPathPrefix: null,
    // `dateRange` is supplied per-facet via `ranges`; the query's own value
    // is unused by `countFacets`.
    dateRange: null,
    limit: 1,
    cursor: null,
  });

  const counts = await SearchService.countFacets(
    query,
    ranges,
    container.searchIndex,
  );

  return {
    facets: SEARCH_PERIODS.map((period, i) => ({
      period,
      count: counts[i] ?? 0,
    })),
  };
}

async function resolveOwnerIdFilter(
  container: ServiceArgs<CountPublicSearchFacetsInput>["container"],
  input: CountPublicSearchFacetsInput,
): Promise<UserId | null> {
  if (input.username === undefined || input.username === null) {
    return null;
  }
  const username = Username.create(input.username);
  return container.unitOfWorkProvider.run(async ({ userRepository }) => {
    const user = await userRepository.findByUsername(username);
    if (user === null) {
      throw new NotFoundError("user", `User not found: ${username}`);
    }
    if (user.status === "deleted" || user.status === "suspended") {
      throw new NotFoundError("user", `User not available: ${username}`);
    }
    return user.id;
  });
}
