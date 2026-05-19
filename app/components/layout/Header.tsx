import { Link } from "@tanstack/react-router";
import type { UserDTO } from "@/core/application/dto";
import {
  APP_HEADER,
  APP_HEADER_LEFT,
  APP_HEADER_RIGHT,
  APP_LOGO,
  AVATAR,
  PILL_BTN,
  SEARCH_BOX_ICON,
  SEARCH_BOX_INPUT,
  SEARCH_BOX_WRAPPER,
} from "./styles";

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
    <header className={APP_HEADER}>
      <div className={APP_HEADER_LEFT}>
        <Link to="/" className={APP_LOGO}>
          Hollow
        </Link>
      </div>
      <div className={SEARCH_BOX_WRAPPER}>
        <form action="/" method="get">
          <label
            htmlFor="header-search"
            className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
          >
            ノート検索
          </label>
          <span className={SEARCH_BOX_ICON} aria-hidden="true" />
          <input
            id="header-search"
            name="q"
            type="search"
            placeholder="ノートを検索"
            autoComplete="off"
            className={SEARCH_BOX_INPUT}
          />
        </form>
      </div>
      <div className={APP_HEADER_RIGHT}>
        <Link to="/notes/new" className={PILL_BTN} data-primary="">
          新規作成
        </Link>
        <Link to="/upload" className={PILL_BTN}>
          アップロード
        </Link>
        <Link
          to="/"
          className={AVATAR}
          title={user.displayName}
          aria-label={`${user.displayName} のメニュー`}
        >
          {initials(user.displayName)}
        </Link>
      </div>
    </header>
  );
}
