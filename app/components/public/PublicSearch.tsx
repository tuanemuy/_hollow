import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { cache } from "react";
import { Icon } from "@/components/common/Icon";
import type { SearchSort } from "@/core/domain/search/valueObject";
import { serverData } from "@/core/presentation/serverAction";
import { formatDate, formatShort } from "./formatNoteDate";
import { highlightSnippet } from "./highlightSnippet";
import { avatarInitials, PublicLayout } from "./PublicLayout";
import { SearchFilterDrawer } from "./SearchFilterDrawer";
import { SearchSortToggle } from "./SearchSortToggle";
import { periodToDateRange, type SearchPeriod } from "./searchPeriod";
import {
  AUTHOR_AVATAR,
  PAGINATION,
  PILL_BTN,
  PUBLIC_MAIN,
  SEARCH_EMPTY,
  SEARCH_FORM,
  SEARCH_FORM_BUTTON,
  SEARCH_FORM_ICON,
  SEARCH_FORM_INPUT,
  SEARCH_HERO,
  SEARCH_HERO_H1,
  SEARCH_HERO_SUB,
  SEARCH_HIT_AUTHOR,
  SEARCH_HIT_DATE,
  SEARCH_HIT_LIST,
  SEARCH_HIT_MAIN,
  SEARCH_HIT_META,
  SEARCH_HIT_ROW,
  SEARCH_HIT_SNIPPET,
  SEARCH_HIT_TITLE,
} from "./styles";

type SearchArgs = {
  keyword: string;
  username: string | null;
  tags: readonly string[] | null;
  period: SearchPeriod | null;
  sort: SearchSort | null;
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
          sort: args.sort,
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
  sort,
  cursor,
  limit,
}: SearchArgs) {
  const hasKeyword = keyword.trim().length > 0;

  const [{ hits, nextCursor }, { facets }] = await Promise.all([
    runSearch({ keyword, username, tags, period, sort, cursor, limit }),
    hasKeyword
      ? runFacets({ keyword, tags, username })
      : Promise.resolve({ facets: [] as const }),
  ]);

  // Results count prefers the facet total for the active period: it applies
  // the same `tagNames` AND filter and visibility gate as the listing, so it
  // is the exact match count independent of the current page. The page hit
  // count is only a lower-bound fallback when facets are absent (no keyword).
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
              {sort !== null ? (
                <input type="hidden" name="sort" value={sort} />
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
          <SearchFilterDrawer
            facets={facets}
            resultsCount={resultsCount}
            countIsLowerBound={countIsLowerBound}
          >
            <SearchSortToggle sort={sort} />
          </SearchFilterDrawer>
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
            hits.map((hit) => {
              const updatedAt = new Date(hit.updatedAt);
              return (
                <Link
                  key={hit.noteId}
                  to="/notes/public/$noteId"
                  params={{ noteId: hit.noteId }}
                  className={SEARCH_HIT_ROW}
                >
                  <div className={SEARCH_HIT_MAIN}>
                    <div className={SEARCH_HIT_TITLE}>
                      {highlightSnippet(hit.title)}
                    </div>
                    {hit.snippet.length > 0 ? (
                      <p className={SEARCH_HIT_SNIPPET}>
                        {highlightSnippet(hit.snippet)}
                      </p>
                    ) : null}
                    <div className={SEARCH_HIT_META}>
                      <span className={SEARCH_HIT_AUTHOR}>
                        <span
                          className={`${AUTHOR_AVATAR} w-[18px] h-[18px] text-[9px]`}
                          aria-hidden="true"
                        >
                          {avatarInitials(hit.username)}
                        </span>
                        <span>@{hit.username}</span>
                      </span>
                      {hit.tagNames.length > 0 ? (
                        <>
                          <span className="text-hairline-strong">·</span>
                          <span className="text-accent">
                            {hit.tagNames.map((t) => `#${t}`).join(" ")}
                          </span>
                        </>
                      ) : null}
                      <span>{formatDate(updatedAt)}</span>
                    </div>
                  </div>
                  <div className={SEARCH_HIT_DATE}>
                    {formatShort(updatedAt)}
                  </div>
                </Link>
              );
            })
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
                ...(sort !== null ? { sort } : {}),
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
