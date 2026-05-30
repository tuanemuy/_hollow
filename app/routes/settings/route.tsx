import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { HOME_SEARCH } from "@/components/auth/links";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

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

const checkAuthenticated = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import(
      "@/core/presentation/authMiddleware"
    );
    const user = await getCurrentUser();
    return { authenticated: user !== null };
  });

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const { authenticated } = await checkAuthenticated();
    if (!authenticated) throw redirect({ to: "/login" });
  },
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
