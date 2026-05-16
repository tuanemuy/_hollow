import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AdminSignUpForm } from "@/components/auth/AdminSignUpForm";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";

const checkSetupEnabled = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const container = await getContainer();
    return { enabled: container.setupTokenVerifier.isEnabled() };
  });

export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    const { enabled } = await checkSetupEnabled();
    if (!enabled) throw notFound();
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, {
      path: "/setup",
      title: "初期管理者セットアップ",
    });
    return { meta, links };
  },
  component: SetupPage,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
  notFoundComponent: () => (
    <div role="alert">
      <h1>404 Not Found</h1>
      <p>このページは利用できません。</p>
    </div>
  ),
});

function SetupPage() {
  return (
    <>
      <AuthHeader />
      <main className="auth-shell">
        <div className="auth-card">
          <AdminSignUpForm />
        </div>
      </main>
    </>
  );
}
