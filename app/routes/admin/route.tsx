import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";

// Side-effect imports so admin server-fn handlers register with the RSC
// manifest before the client-side bundle freezes it.
import "@/components/admin/LLMSettingsForm/action";
import "@/components/admin/PromptsForm/action";
import "@/components/admin/DesignTokensForm/action";
import "@/components/admin/RegistrationForm/action";
import "@/components/admin/UsersTable/action";
import "@/components/admin/Jobs/action";

const ADMIN_SHELL_CLASS =
  "min-h-screen bg-bg text-ink font-sans text-md leading-normal tracking-normal antialiased";

const ADMIN_HEADER_CLASS =
  "sticky top-0 z-50 grid grid-cols-[auto_1fr_auto] items-center gap-5 px-6 py-[14px] bg-[var(--header-bg)] supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(20px)] supports-[backdrop-filter]:[-webkit-backdrop-filter:saturate(180%)_blur(20px)] max-sm:gap-[10px] max-sm:px-4 max-sm:py-3";

const ADMIN_HEADER_LEFT_CLASS = "flex items-center gap-3";

const ADMIN_LOGO_CLASS =
  "text-[21px] font-light tracking-tightest text-ink max-sm:hidden";

const ADMIN_PILL_CLASS =
  "inline-flex items-center gap-1.5 px-[10px] py-1 rounded-pill bg-accent-surface text-accent-ink text-xs font-medium before:content-[''] before:w-[6px] before:h-[6px] before:rounded-full before:bg-accent";

const ADMIN_MAIN_CLASS =
  "max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-10 pb-20";

const ADMIN_PAGE_TITLE_CLASS =
  "text-3xl font-regular tracking-tightest leading-tight m-0 mb-2";

const ADMIN_PAGE_SUBTITLE_CLASS = "text-md text-ink-secondary m-0 mb-8";

const ADMIN_BTN_CLASS =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-surface text-ink text-sm font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
  errorComponent: ({ error }) => (
    <div className={ADMIN_SHELL_CLASS}>
      <header className={ADMIN_HEADER_CLASS}>
        <div className={ADMIN_HEADER_LEFT_CLASS}>
          <Link
            to="/"
            search={{ page: 1, limit: 20 }}
            className={ADMIN_LOGO_CLASS}
          >
            Hollow
          </Link>
          <span className={ADMIN_PILL_CLASS}>管理者モード</span>
        </div>
      </header>
      <main className={ADMIN_MAIN_CLASS}>
        <h1 className={ADMIN_PAGE_TITLE_CLASS}>アクセスできません</h1>
        <p className={ADMIN_PAGE_SUBTITLE_CLASS}>{sanitizeRouteError(error)}</p>
        <Link
          to="/"
          search={{ page: 1, limit: 20 }}
          className={ADMIN_BTN_CLASS}
        >
          ホームへ戻る
        </Link>
      </main>
    </div>
  ),
  notFoundComponent: () => (
    <div className={ADMIN_SHELL_CLASS}>
      <header className={ADMIN_HEADER_CLASS}>
        <div className={ADMIN_HEADER_LEFT_CLASS}>
          <Link
            to="/"
            search={{ page: 1, limit: 20 }}
            className={ADMIN_LOGO_CLASS}
          >
            Hollow
          </Link>
          <span className={ADMIN_PILL_CLASS}>管理者モード</span>
        </div>
      </header>
      <main className={ADMIN_MAIN_CLASS}>
        <h1 className={ADMIN_PAGE_TITLE_CLASS}>ページが見つかりません</h1>
        <Link to="/admin" className={ADMIN_BTN_CLASS}>
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
    | "/admin/metrics"
    | "/admin/jobs";
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
  { to: "/admin/jobs", label: "ジョブ監視" },
];

function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div className={ADMIN_SHELL_CLASS}>
      <header className={ADMIN_HEADER_CLASS}>
        <div className={ADMIN_HEADER_LEFT_CLASS}>
          <Link
            to="/"
            search={{ page: 1, limit: 20 }}
            className={ADMIN_LOGO_CLASS}
          >
            Hollow
          </Link>
          <span className={ADMIN_PILL_CLASS}>管理者モード</span>
        </div>
        <div />
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-[12px] font-medium bg-[linear-gradient(135deg,#c9d3df_0%,#8e99a8_100%)]"
            aria-hidden="true"
          >
            AD
          </div>
        </div>
      </header>
      <nav
        className="sticky top-[var(--header-height)] z-40 h-11 overflow-x-auto border-b border-hairline bg-[rgba(255,255,255,0.9)] backdrop-blur-[20px] backdrop-saturate-[180%] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="管理ナビゲーション"
      >
        <div className="max-w-[var(--container-max)] h-full mx-auto px-[var(--container-padding)] flex items-center gap-1 whitespace-nowrap">
          {ADMIN_NAV.map((item) => {
            const active =
              item.to === "/admin"
                ? pathname === "/admin" || pathname === "/admin/"
                : pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                data-active={active || undefined}
                className="inline-flex items-center h-8 px-3 rounded-md text-sm text-ink-secondary no-underline transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface hover:text-ink data-[active]:bg-surface data-[active]:text-ink data-[active]:font-medium"
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
