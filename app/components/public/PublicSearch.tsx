import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { cache } from "react";
import { Icon } from "@/components/common/Icon";
import { serverData } from "@/core/presentation/serverAction";
import { avatarInitials, PublicLayout } from "./PublicLayout";
import { SearchFilterDrawer } from "./SearchFilterDrawer";
import { periodToDateRange, type SearchPeriod } from "./searchPeriod";
import {
  AUTHOR_AVATAR,
  FILTER_BAR,
  FILTER_BAR_LEFT,
  FILTER_BAR_RIGHT,
  PAGINATION,
  PILL_BTN,
  PUBLIC_MAIN,
  RESULTS_COUNT,
  SEARCH_EMPTY,
  SEARCH_FORM,
  SEARCH_FORM_BUTTON,
  SEARCH_FORM_ICON,
  SEARCH_FORM_INPUT,
  SEARCH_HERO,
  SEARCH_HERO_H1,
  SEARCH_HERO_SUB,
  SEARCH_HIT_AUTHOR,
  SEARCH_HIT_LIST,
  SEARCH_HIT_META,
  SEARCH_HIT_ROW,
  SEARCH_HIT_SNIPPET,
  SEARCH_HIT_TITLE,
  SORT_LABEL,
} from "./styles";

type SearchArgs = {
  keyword: string;
  username: string | null;
  tags: readonly string[] | null;
  period: SearchPeriod | null;
  cursor: string | null;
  limit: number;
};

const runSearch = cache(
  serverData(
    () => import("@/core/application/search/searchPublicNotes"),
    async ({ container }, { searchPublicNotes }, args: SearchArgs) => {
      if (args.keyword.trim().length === 0) {
        return { hits: [], nextCursor: null } as const;
      }
      return searchPublicNotes({
        container,
        input: {
          viewerUserId: null,
          keyword: args.keyword,
          tagNames: args.tags ?? [],
          dateRange: periodToDateRange(args.period, new Date()),
          username: args.username,
          cursor: args.cursor,
          limit: args.limit,
        },
      });
    },
  ),
);

const runFacets = cache(
  serverData(
    () => import("@/core/application/search/countPublicSearchFacets"),
    async (
      { container },
      { countPublicSearchFacets },
      args: {
        keyword: string;
        tags: readonly string[] | null;
        username: string | null;
      },
    ) => {
      return countPublicSearchFacets({
        container,
        input: {
          keyword: args.keyword,
          tagNames: args.tags ?? [],
          username: args.username,
        },
      });
    },
  ),
);

export async function PublicSearch({
  keyword,
  username,
  tags,
  period,
  cursor,
  limit,
}: SearchArgs) {
  const hasKeyword = keyword.trim().length > 0;

  const [{ hits, nextCursor }, { facets }] = await Promise.all([
    runSearch({ keyword, username, tags, period, cursor, limit }),
    hasKeyword
      ? runFacets({ keyword, tags, username })
      : Promise.resolve({ facets: [] as const }),
  ]);

  // Results count prefers the facet total for the active period (exact,
  // independent of the current page); falls back to the page hit count when
  // facets are unavailable (no keyword). `countPublicSearchFacets` applies
  // the same `tagNames` AND filter and visibility gate as the listing, so
  // the facet total is the exact match count for the active period — the
  // page hit count is only the lower-bound fallback when facets are absent.
  const facetTotal = facets.find((f) => f.period === (period ?? "all"))?.count;
  const resultsCount = facetTotal ?? hits.length;
  const countIsLowerBound = facetTotal === undefined && nextCursor !== null;

  return (
    <PublicLayout searchKeyword={keyword} hideHeaderSearch>
      <main className={PUBLIC_MAIN}>
        <section className={SEARCH_HERO}>
          <h1 className={SEARCH_HERO_H1}>公開ノートを検索</h1>
          <p className={SEARCH_HERO_SUB}>
            このインスタンス全体の公開ノートから横断検索できます
          </p>
          <search className={SEARCH_FORM}>
            <form method="get" action="/search">
              <Icon icon={Search} size={20} className={SEARCH_FORM_ICON} />
              <label
                htmlFor="public-search-input"
                className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
              >
                キーワード
              </label>
              <input
                id="public-search-input"
                type="search"
                name="q"
                defaultValue={keyword}
                placeholder="キーワードを入力"
                className={SEARCH_FORM_INPUT}
              />
              {/* Preserve the active filters across a native re-submit so
                  retyping the keyword keeps the user / tag / period selection
                  (symmetric with `username`). Pagination (`cursor`/`limit`)
                  is intentionally reset on a fresh keyword. */}
              {username !== null ? (
                <input type="hidden" name="username" value={username} />
              ) : null}
              {tags?.map((tag) => (
                <input key={tag} type="hidden" name="tags" value={tag} />
              ))}
              {period !== null ? (
                <input type="hidden" name="period" value={period} />
              ) : null}
              <button
                type="submit"
                className={SEARCH_FORM_BUTTON}
                data-primary=""
              >
                検索
              </button>
            </form>
          </search>
        </section>

        {hasKeyword ? (
          <div className={FILTER_BAR}>
            <div className={FILTER_BAR_LEFT}>
              <div className={RESULTS_COUNT}>
                <strong className="text-ink font-semibold">
                  {resultsCount}
                  {countIsLowerBound ? "+" : ""} 件
                </strong>
                のノート
              </div>
            </div>
            <div className={FILTER_BAR_RIGHT}>
              <SearchFilterDrawer facets={facets} />
              {/* Sort axis is fixed to relevance order (no toggle) — the
                  public search ranks by score; see plan S-002. */}
              <span className={SORT_LABEL}>関連度順</span>
            </div>
          </div>
        ) : null}

        <section className={SEARCH_HIT_LIST} aria-label="検索結果">
          {!hasKeyword ? (
            <div className={SEARCH_EMPTY}>
              <h2 className="text-lg font-semibold mb-2 text-ink">
                まだ検索していません
              </h2>
              <p>上の検索バーにキーワードを入力してください。</p>
            </div>
          ) : hits.length === 0 ? (
            <div className={SEARCH_EMPTY}>
              <h2 className="text-lg font-semibold mb-2 text-ink">
                該当するノートが見つかりませんでした
              </h2>
              <p>キーワードを変えて再度お試しください。</p>
            </div>
          ) : (
            hits.map((hit) => (
              <Link
                key={hit.noteId}
                to="/notes/public/$noteId"
                params={{ noteId: hit.noteId }}
                className={SEARCH_HIT_ROW}
              >
                <div className={SEARCH_HIT_AUTHOR}>
                  <span
                    className={`${AUTHOR_AVATAR} w-[18px] h-[18px] text-[8px]`}
                    aria-hidden="true"
                  >
                    {avatarInitials(hit.username)}
                  </span>
                  <span>@{hit.username}</span>
                </div>
                <div className={SEARCH_HIT_TITLE}>{hit.title}</div>
                {hit.snippet.length > 0 ? (
                  <p className={SEARCH_HIT_SNIPPET}>{hit.snippet}</p>
                ) : null}
                {hit.tagNames.length > 0 ? (
                  <div className={SEARCH_HIT_META}>
                    <span>{hit.tagNames.map((t) => `#${t}`).join(" ")}</span>
                  </div>
                ) : null}
              </Link>
            ))
          )}
        </section>

        {nextCursor !== null ? (
          <nav className={PAGINATION} aria-label="ページネーション">
            <span />
            <Link
              to="/search"
              search={{
                q: keyword,
                ...(username !== null ? { username } : {}),
                ...(tags !== null && tags.length > 0
                  ? { tags: [...tags] }
                  : {}),
                ...(period !== null ? { period } : {}),
                cursor: nextCursor,
                limit,
              }}
              className={PILL_BTN}
            >
              次のページ
            </Link>
          </nav>
        ) : null}
      </main>
    </PublicLayout>
  );
}
