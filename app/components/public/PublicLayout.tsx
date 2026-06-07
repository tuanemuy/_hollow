import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { HOME_SEARCH } from "@/components/auth/links";
import { BrandLockup } from "@/components/common/BrandLogo";
import { Icon } from "@/components/common/Icon";
import {
  PILL_BTN,
  PUBLIC_FOOTER,
  PUBLIC_FOOTER_INNER,
  PUBLIC_FOOTER_LINK,
  PUBLIC_FOOTER_LINKS,
  PUBLIC_HEADER,
  PUBLIC_HEADER_LEFT,
  PUBLIC_HEADER_RIGHT,
  PUBLIC_HEADER_SEARCH,
  PUBLIC_HEADER_SEARCH_INPUT,
  PUBLIC_TEXT_LINK_SIGNUP,
  SEARCH_ICON,
} from "./styles";

type PublicLayoutProps = {
  children: ReactNode;
  searchKeyword?: string;
  hideHeaderSearch?: boolean;
};

export function PublicLayout({
  children,
  searchKeyword = "",
  hideHeaderSearch = false,
}: PublicLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className={PUBLIC_HEADER}>
        <div className={PUBLIC_HEADER_LEFT}>
          <Link to="/" search={HOME_SEARCH} className="text-ink">
            <BrandLockup />
          </Link>
        </div>

        {hideHeaderSearch ? (
          <div />
        ) : (
          <search className={PUBLIC_HEADER_SEARCH}>
            <form method="get" action="/search">
              <Icon icon={Search} size={16} className={SEARCH_ICON} />
              <label
                htmlFor="public-header-keyword"
                className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
              >
                公開ノートを検索
              </label>
              <input
                id="public-header-keyword"
                type="search"
                name="q"
                defaultValue={searchKeyword}
                placeholder="公開ノートを検索"
                className={PUBLIC_HEADER_SEARCH_INPUT}
              />
            </form>
          </search>
        )}

        <div className={PUBLIC_HEADER_RIGHT}>
          <Link to="/" search={HOME_SEARCH} className={PUBLIC_TEXT_LINK_SIGNUP}>
            サインアップ
          </Link>
          <Link to="/" search={HOME_SEARCH} className={PILL_BTN}>
            ログイン
          </Link>
        </div>
      </header>

      {children}

      <footer className={PUBLIC_FOOTER}>
        <div className={PUBLIC_FOOTER_INNER}>
          <div>
            <BrandLockup />
          </div>
          <div className={PUBLIC_FOOTER_LINKS}>
            <Link to="/terms" className={PUBLIC_FOOTER_LINK}>
              利用規約
            </Link>
            <Link to="/privacy" className={PUBLIC_FOOTER_LINK}>
              プライバシー
            </Link>
            <Link to="/about" className={PUBLIC_FOOTER_LINK}>
              このインスタンスについて
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function avatarInitials(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}
