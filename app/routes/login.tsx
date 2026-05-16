import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { LoginForm } from "@/components/auth/LoginForm";
import { HOME_SEARCH } from "@/components/auth/links";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";

const checkAlreadyAuthenticated = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import(
      "@/core/presentation/authMiddleware"
    );
    const user = await getCurrentUser();
    return { authenticated: user !== null };
  });

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { authenticated } = await checkAlreadyAuthenticated();
    if (authenticated) throw redirect({ to: "/", search: HOME_SEARCH });
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, {
      path: "/login",
      title: "ログイン",
    });
    return { meta, links };
  },
  component: LoginPage,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function LoginPage() {
  return (
    <>
      <AuthHeader
        rightSlot={
          <Link to="/signup" className="header-link">
            アカウント作成
          </Link>
        }
      />
      <main className="auth-shell">
        <div className="auth-card">
          <LoginForm />
        </div>
      </main>
    </>
  );
}
