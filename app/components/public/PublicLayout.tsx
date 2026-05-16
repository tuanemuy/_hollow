import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header-left">
          <Link to="/" search={{ page: 1, limit: 20 }} className="public-logo">
            Hollow
          </Link>
        </div>

        {hideHeaderSearch ? (
          <div />
        ) : (
          <search className="public-header-search">
            <form method="get" action="/search">
              <SearchIcon />
              <label
                htmlFor="public-header-keyword"
                className="visually-hidden"
              >
                公開ノートを検索
              </label>
              <input
                id="public-header-keyword"
                type="search"
                name="q"
                defaultValue={searchKeyword}
                placeholder="公開ノートを検索"
              />
            </form>
          </search>
        )}

        <div className="public-header-right">
          <Link
            to="/"
            search={{ page: 1, limit: 20 }}
            className="public-text-link signup"
          >
            サインアップ
          </Link>
          <Link to="/" search={{ page: 1, limit: 20 }} className="pill-btn">
            ログイン
          </Link>
        </div>
      </header>

      {children}

      <footer className="public-footer">
        <div className="public-footer-inner">
          <div>Hollow</div>
          <div className="public-footer-links">
            <Link to="/" search={{ page: 1, limit: 20 }}>
              利用規約
            </Link>
            <Link to="/" search={{ page: 1, limit: 20 }}>
              プライバシー
            </Link>
            <Link to="/" search={{ page: 1, limit: 20 }}>
              このインスタンスについて
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function SearchIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg
      className="search-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function avatarInitials(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}
