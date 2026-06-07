import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";
import {
  NAV_ITEM,
  SIDEBAR_SECTION,
  SIDEBAR_SECTION_TITLE,
} from "@/components/layout/styles";
import { SIDEBAR_BACK } from "./styles";

type NavItem = {
  to:
    | "/settings/profile"
    | "/settings/security"
    | "/settings/prompts"
    | "/settings/account-delete";
  label: string;
};

const NAV: readonly NavItem[] = [
  { to: "/settings/profile", label: "プロフィール" },
  { to: "/settings/security", label: "セキュリティ" },
  { to: "/settings/prompts", label: "プロンプト" },
  { to: "/settings/account-delete", label: "アカウント削除" },
];

const ACTIVE_NAV_PROPS = {
  "data-active": "",
  "aria-current": "page" as const,
};

// The positioned `<aside>` (drawer on mobile, sticky column on desktop) is
// provided by `AppShellDrawer`; this component renders only the inner sections,
// mirroring `layout/Sidebar` so the settings sub-nav matches the library
// sidebar exactly.
export function SettingsSidebarNav() {
  return (
    <nav aria-label="設定ナビゲーション" className={SIDEBAR_SECTION}>
      <Link to="/" search={HOME_SEARCH} className={SIDEBAR_BACK}>
        <Icon icon={ArrowLeft} />
        すべてのノートに戻る
      </Link>
      <div className={SIDEBAR_SECTION_TITLE}>設定</div>
      <ul className="list-none m-0 p-0">
        {NAV.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className={NAV_ITEM}
              activeProps={ACTIVE_NAV_PROPS}
            >
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
