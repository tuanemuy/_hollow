import { Link } from "@tanstack/react-router";
import type { UserDTO } from "@/core/application/dto";

type Props = {
  user: UserDTO;
};

function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

export function Header({ user }: Props) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <Link to="/" className="app-logo">
          Hollow
        </Link>
      </div>
      <div className="search-box">
        <form action="/" method="get">
          <label htmlFor="header-search" className="sr-only">
            ノート検索
          </label>
          <input
            id="header-search"
            name="q"
            type="search"
            placeholder="ノートを検索"
            autoComplete="off"
          />
        </form>
      </div>
      <div className="app-header-right">
        <Link to="/notes/new" className="pill-btn primary">
          新規作成
        </Link>
        <Link to="/upload" className="pill-btn">
          アップロード
        </Link>
        <Link
          to="/"
          className="avatar"
          title={user.displayName}
          aria-label={`${user.displayName} のメニュー`}
        >
          {initials(user.displayName)}
        </Link>
      </div>
    </header>
  );
}
