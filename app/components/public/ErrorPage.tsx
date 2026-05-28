import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";
import { PublicLayout } from "./PublicLayout";
import {
  ERR_ACTIONS,
  ERR_CODE,
  ERR_DESC,
  ERR_INNER,
  ERR_META,
  ERR_PAGE,
  ERR_TITLE,
  PILL_BTN,
  SEARCH_ICON,
  USER_SEARCH_INPUT,
} from "./styles";

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
      <section className={ERR_PAGE}>
        <div className={ERR_INNER}>
          <div className={ERR_CODE} aria-hidden="true">
            {copy.code}
          </div>
          <h1 className={ERR_TITLE}>{copy.title}</h1>
          <p className={ERR_DESC}>{message ?? copy.desc}</p>

          {showSearch ? (
            <search className="relative max-w-[440px] mx-auto mb-6">
              <form method="get" action="/search">
                <Icon icon={Search} size={16} className={SEARCH_ICON} />
                <label
                  htmlFor="err-search"
                  className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
                >
                  ノートを検索
                </label>
                <input
                  id="err-search"
                  type="search"
                  name="q"
                  placeholder="公開ノートを検索…"
                  className={USER_SEARCH_INPUT}
                />
              </form>
            </search>
          ) : null}

          <div className={ERR_ACTIONS}>
            <Link
              to="/"
              search={HOME_SEARCH}
              className={PILL_BTN}
              data-primary=""
            >
              ホームへ戻る
            </Link>
            <Link
              to="/search"
              search={{ q: "", limit: 20 }}
              className={PILL_BTN}
            >
              検索ページを開く
            </Link>
          </div>

          <div className={ERR_META}>{copy.meta}</div>
        </div>
      </section>
    </PublicLayout>
  );
}
