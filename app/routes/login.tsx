import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { LoginForm } from "@/components/auth/LoginForm";
import { redirectAuthenticatedRoute } from "@/core/presentation/authGuard";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

export const Route = createFileRoute("/login")({
  beforeLoad: redirectAuthenticatedRoute,
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
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap">
        {sanitizeRouteError(error)}
      </pre>
    </div>
  ),
});

function LoginPage() {
  return (
    <>
      <AuthHeader
        rightSlot={
          <Link
            to="/signup"
            className="text-sm text-ink-secondary px-3 py-2 rounded-md transition-colors motion-reduce:transition-none hover:text-ink hover:bg-surface"
          >
            アカウント作成
          </Link>
        }
      />
      <main className="min-h-[calc(100vh-var(--header-height))] flex items-start justify-center px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-20 lg:pt-20">
        <div className="w-full max-w-[440px] mx-auto">
          <LoginForm />
        </div>
      </main>
    </>
  );
}
