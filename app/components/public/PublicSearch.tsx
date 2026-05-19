import { Link } from "@tanstack/react-router";
import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";
import { avatarInitials, PublicLayout, SearchIcon } from "./PublicLayout";
import {
  AUTHOR_AVATAR,
  PAGINATION,
  PILL_BTN,
  PUBLIC_MAIN,
  SEARCH_EMPTY,
  SEARCH_FORM,
  SEARCH_FORM_BUTTON,
  SEARCH_FORM_INPUT,
  SEARCH_HERO,
  SEARCH_HERO_H1,
  SEARCH_HIT_AUTHOR,
  SEARCH_HIT_LIST,
  SEARCH_HIT_META,
  SEARCH_HIT_ROW,
  SEARCH_HIT_SNIPPET,
  SEARCH_HIT_TITLE,
  SEARCH_SUMMARY,
} from "./styles";

type SearchArgs = {
  keyword: string;
  username: string | null;
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
          tagNames: [],
          dateRange: null,
          username: args.username,
          cursor: args.cursor,
          limit: args.limit,
        },
      });
    },
  ),
);

export async function PublicSearch({
  keyword,
  username,
  cursor,
  limit,
}: SearchArgs) {
  const { hits, nextCursor } = await runSearch({
    keyword,
    username,
    cursor,
    limit,
  });

  const hasKeyword = keyword.trim().length > 0;

  return (
    <PublicLayout searchKeyword={keyword} hideHeaderSearch>
      <main className={PUBLIC_MAIN}>
        <section className={SEARCH_HERO}>
          <h1 className={SEARCH_HERO_H1}>公開ノートを検索</h1>
          <search className={SEARCH_FORM}>
            <form method="get" action="/search">
              <SearchIcon size={18} />
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
              {username !== null ? (
                <input type="hidden" name="username" value={username} />
              ) : null}
              <button type="submit" className={SEARCH_FORM_BUTTON}>
                検索
              </button>
            </form>
          </search>
        </section>

        {hasKeyword ? (
          <div className={SEARCH_SUMMARY}>
            <span>
              <strong className="text-ink font-semibold">「{keyword}」</strong>
              の検索結果
            </span>
            {username !== null ? (
              <>
                <span>·</span>
                <span>ユーザー: @{username}</span>
              </>
            ) : null}
            <span>·</span>
            <span>
              {hits.length}
              {nextCursor !== null ? "+" : ""} 件
            </span>
          </div>
        ) : null}

        <section className={SEARCH_HIT_LIST} aria-label="検索結果">
          {!hasKeyword ? (
            <div className={SEARCH_EMPTY}>
              <h2 className="text-lg font-semibold mb-2 text-ink">
                キーワードを入力してください
              </h2>
              <p>同じインスタンスの公開ノートを横断検索できます。</p>
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
