import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { HOME_SEARCH } from "@/components/auth/links";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";

const checkAlreadyAuthenticated = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import("@/core/presentation/authMiddleware");
    const user = await getCurrentUser();
    return { authenticated: user !== null };
  });

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const { authenticated } = await checkAlreadyAuthenticated();
    if (authenticated) throw redirect({ to: "/", search: HOME_SEARCH });
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, {
      path: "/signup",
      title: "アカウント作成",
    });
    return { meta, links };
  },
  component: SignUpPage,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function SignUpPage() {
  return (
    <>
      <AuthHeader />
      <main className="auth-shell">
        <div className="auth-card">
          <SignUpForm />
        </div>
      </main>
    </>
  );
}
