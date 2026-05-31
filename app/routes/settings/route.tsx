import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { HOME_SEARCH } from "@/components/auth/links";
import { requireAuthenticatedRoute } from "@/core/presentation/authGuard";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";

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
  component: SettingsLayout,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function SettingsLayout() {
  const { pathname } = useLocation();
  return (
    <div>
      <header>
        <Link to="/" search={HOME_SEARCH}>
          ← Home
        </Link>
        <h1>設定</h1>
      </header>
      <nav aria-label="設定ナビゲーション">
        <ul>
          {NAV.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <li key={item.to}>
                <Link to={item.to} aria-current={active ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
