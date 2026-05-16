import { Link } from "@tanstack/react-router";
import { cache } from "react";
import { serverData } from "@/core/presentation/serverAction";
import { avatarInitials, PublicLayout, SearchIcon } from "./PublicLayout";

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
      <main className="public-main">
        <section className="search-hero">
          <h1>公開ノートを検索</h1>
          <search className="search-form">
            <form method="get" action="/search">
              <SearchIcon size={18} />
              <label htmlFor="public-search-input" className="visually-hidden">
                キーワード
              </label>
              <input
                id="public-search-input"
                type="search"
                name="q"
                defaultValue={keyword}
                placeholder="キーワードを入力"
              />
              {username !== null ? (
                <input type="hidden" name="username" value={username} />
              ) : null}
              <button type="submit">検索</button>
            </form>
          </search>
        </section>

        {hasKeyword ? (
          <div className="search-summary">
            <span>
              <strong>「{keyword}」</strong>の検索結果
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

        <section className="search-hit-list" aria-label="検索結果">
          {!hasKeyword ? (
            <div className="search-empty">
              <h2>キーワードを入力してください</h2>
              <p>同じインスタンスの公開ノートを横断検索できます。</p>
            </div>
          ) : hits.length === 0 ? (
            <div className="search-empty">
              <h2>該当するノートが見つかりませんでした</h2>
              <p>キーワードを変えて再度お試しください。</p>
            </div>
          ) : (
            hits.map((hit) => (
              <Link
                key={hit.noteId}
                to="/notes/public/$noteId"
                params={{ noteId: hit.noteId }}
                className="search-hit-row"
              >
                <div className="search-hit-author">
                  <span className="author-avatar" aria-hidden="true">
                    {avatarInitials(hit.username)}
                  </span>
                  <span>@{hit.username}</span>
                </div>
                <div className="search-hit-title">{hit.title}</div>
                {hit.snippet.length > 0 ? (
                  <p className="search-hit-snippet">{hit.snippet}</p>
                ) : null}
                {hit.tagNames.length > 0 ? (
                  <div className="search-hit-meta">
                    <span>{hit.tagNames.map((t) => `#${t}`).join(" ")}</span>
                  </div>
                ) : null}
              </Link>
            ))
          )}
        </section>

        {nextCursor !== null ? (
          <nav className="pagination" aria-label="ページネーション">
            <span />
            <Link
              to="/search"
              search={{
                q: keyword,
                ...(username !== null ? { username } : {}),
                cursor: nextCursor,
                limit,
              }}
              className="pill-btn"
            >
              次のページ
            </Link>
          </nav>
        ) : null}
      </main>
    </PublicLayout>
  );
}
