import { Link } from "@tanstack/react-router";
import { PublicLayout, SearchIcon } from "./PublicLayout";

export type ErrorPageKind = "notFound" | "forbidden" | "gone" | "system";

type Props = {
  kind: ErrorPageKind;
  message?: string;
};

const COPY: Record<
  ErrorPageKind,
  { code: string; title: string; desc: string; meta: string }
> = {
  notFound: {
    code: "404",
    title: "ページが見つかりません",
    desc: "お探しのページは削除されたか、URL が変更された可能性があります。検索からノートを探してみてください。",
    meta: "Error code: 404 Not Found",
  },
  forbidden: {
    code: "403",
    title: "このページにアクセスできません",
    desc: "閲覧権限がありません。ログインしている場合は、別のアカウントで再度試してみてください。",
    meta: "Error code: 403 Forbidden",
  },
  gone: {
    code: "410",
    title: "このノートは公開されていません",
    desc: "作者により非公開化または削除されました。同じユーザーの他のノートを覗いてみてください。",
    meta: "Error code: 410 Gone",
  },
  system: {
    code: "500",
    title: "予期しないエラーが発生しました",
    desc: "サーバー側で問題が発生しています。しばらく経ってから再度お試しください。問題が続く場合はインスタンス管理者にお知らせください。",
    meta: "Error code: 500 Internal Server Error",
  },
};

export function ErrorPage({ kind, message }: Props) {
  const copy = COPY[kind];
  const showSearch = kind === "notFound" || kind === "gone";
  return (
    <PublicLayout hideHeaderSearch>
      <section className="err-page">
        <div className="err-inner">
          <div className="err-code" aria-hidden="true">
            {copy.code}
          </div>
          <h1 className="err-title">{copy.title}</h1>
          <p className="err-desc">{message ?? copy.desc}</p>

          {showSearch ? (
            <search
              className="user-search"
              style={{ margin: "0 auto 24px", maxWidth: 440 }}
            >
              <form method="get" action="/search">
                <SearchIcon />
                <label htmlFor="err-search" className="visually-hidden">
                  ノートを検索
                </label>
                <input
                  id="err-search"
                  type="search"
                  name="q"
                  placeholder="公開ノートを検索…"
                />
              </form>
            </search>
          ) : null}

          <div className="err-actions">
            <Link
              to="/"
              search={{ page: 1, limit: 20 }}
              className="pill-btn primary"
            >
              ホームへ戻る
            </Link>
            <Link
              to="/search"
              search={{ q: "", limit: 20 }}
              className="pill-btn"
            >
              検索ページを開く
            </Link>
          </div>

          <div className="err-meta">{copy.meta}</div>
        </div>
      </section>
    </PublicLayout>
  );
}
