import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { HOME_SEARCH } from "@/components/auth/links";
import {
  SETTINGS_BACK_LINK,
  SETTINGS_CONTENT,
  SETTINGS_ERROR_BODY,
  SETTINGS_ERROR_BOX,
  SETTINGS_ERROR_TITLE,
  SETTINGS_GRID,
  SETTINGS_HEADER,
  SETTINGS_NAV,
  SETTINGS_NAV_ITEM,
  SETTINGS_SUBTITLE,
  SETTINGS_TITLE,
  SETTINGS_WRAP,
} from "@/components/identity/styles";
import { requireAuthenticatedRoute } from "@/core/presentation/authGuard";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

// Register server-fn handlers with the RSC manifest before the client
// bundle freezes it.
import "@/components/identity/ProfileForm/action";
import "@/components/identity/SecurityForm/action";
import "@/components/identity/PromptsForm/action";
import "@/components/identity/AccountDeleteForm/action";

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

export const Route = createFileRoute("/settings")({
  beforeLoad: requireAuthenticatedRoute,
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `設定 — ${config.siteName}`,
      noIndex: true,
    });
  },
  component: SettingsLayout,
  errorComponent: ({ error }) => (
    <div role="alert" className={SETTINGS_ERROR_BOX}>
      <h1 className={SETTINGS_ERROR_TITLE}>エラーが発生しました</h1>
      <pre className={SETTINGS_ERROR_BODY}>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function SettingsLayout() {
  const { pathname } = useLocation();
  return (
    <div className={SETTINGS_WRAP}>
      <header className={SETTINGS_HEADER}>
        <Link to="/" search={HOME_SEARCH} className={SETTINGS_BACK_LINK}>
          ← Home
        </Link>
        <h1 className={SETTINGS_TITLE}>設定</h1>
        <p className={SETTINGS_SUBTITLE}>
          アカウント、外観、AI の挙動を調整します。
        </p>
      </header>
      <div className={SETTINGS_GRID}>
        <nav aria-label="設定ナビゲーション" className={SETTINGS_NAV}>
          {NAV.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                data-active={active || undefined}
                className={SETTINGS_NAV_ITEM}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={SETTINGS_CONTENT}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
