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
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap">
        {sanitizeRouteError(error)}
      </pre>
    </div>
  ),
  notFoundComponent: () => (
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-2">404 Not Found</h1>
      <p className="text-sm text-ink-secondary">このページは利用できません。</p>
    </div>
  ),
});

function SetupPage() {
  return (
    <>
      <AuthHeader />
      <main className="min-h-[calc(100vh-var(--header-height))] flex items-start justify-center px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-20 lg:pt-20">
        <div className="w-full max-w-[440px] mx-auto">
          <AdminSignUpForm />
        </div>
      </main>
    </>
  );
}
