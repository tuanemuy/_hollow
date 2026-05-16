import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import adminCss from "../../styles/admin.css?url";

// Side-effect imports so admin server-fn handlers register with the RSC
// manifest before the client-side bundle freezes it.
import "@/components/admin/LLMSettingsForm/action";
import "@/components/admin/PromptsForm/action";
import "@/components/admin/DesignTokensForm/action";
import "@/components/admin/RegistrationForm/action";
import "@/components/admin/UsersTable/action";

export const Route = createFileRoute("/admin")({
  head: () => ({
    links: [{ rel: "stylesheet", href: adminCss }],
  }),
  component: AdminLayout,
  errorComponent: ({ error }) => (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-left">
          <Link to="/" search={{ page: 1, limit: 20 }} className="admin-logo">
            Hollow
          </Link>
          <span className="admin-pill">管理者モード</span>
        </div>
      </header>
      <main className="admin-main">
        <h1 className="admin-page-title">アクセスできません</h1>
        <p className="admin-page-subtitle">{sanitizeRouteError(error)}</p>
        <Link to="/" search={{ page: 1, limit: 20 }} className="admin-btn">
          ホームへ戻る
        </Link>
      </main>
    </div>
  ),
  notFoundComponent: () => (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-left">
          <Link to="/" search={{ page: 1, limit: 20 }} className="admin-logo">
            Hollow
          </Link>
          <span className="admin-pill">管理者モード</span>
        </div>
      </header>
      <main className="admin-main">
        <h1 className="admin-page-title">ページが見つかりません</h1>
        <Link to="/admin" className="admin-btn">
          管理ダッシュボードへ
        </Link>
      </main>
    </div>
  ),
});

type AdminNavItem = {
  to:
    | "/admin"
    | "/admin/llm"
    | "/admin/prompts"
    | "/admin/design"
    | "/admin/registration"
    | "/admin/users"
    | "/admin/metrics";
  label: string;
};

const ADMIN_NAV: readonly AdminNavItem[] = [
  { to: "/admin", label: "ダッシュボード" },
  { to: "/admin/llm", label: "LLM 設定" },
  { to: "/admin/prompts", label: "プロンプト" },
  { to: "/admin/design", label: "デザイントークン" },
  { to: "/admin/registration", label: "登録制御" },
  { to: "/admin/users", label: "ユーザー" },
  { to: "/admin/metrics", label: "利用状況" },
];

function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-left">
          <Link to="/" search={{ page: 1, limit: 20 }} className="admin-logo">
            Hollow
          </Link>
          <span className="admin-pill">管理者モード</span>
        </div>
        <div />
        <div className="admin-header-right">
          <div className="admin-avatar" aria-hidden="true">
            AD
          </div>
        </div>
      </header>
      <nav className="admin-nav" aria-label="管理ナビゲーション">
        <div className="admin-nav-inner">
          {ADMIN_NAV.map((item) => {
            const active =
              item.to === "/admin"
                ? pathname === "/admin" || pathname === "/admin/"
                : pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={active ? "active" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
