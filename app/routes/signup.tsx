import { createFileRoute } from "@tanstack/react-router";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { redirectAuthenticatedRoute } from "@/core/presentation/authGuard";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

export const Route = createFileRoute("/signup")({
  beforeLoad: redirectAuthenticatedRoute,
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
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap">
        {sanitizeRouteError(error)}
      </pre>
    </div>
  ),
});

function SignUpPage() {
  return (
    <>
      <AuthHeader />
      <main className="min-h-[calc(100vh-var(--header-height))] flex items-start justify-center px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-20 lg:pt-20">
        <div className="w-full max-w-[440px] mx-auto">
          <SignUpForm />
        </div>
      </main>
    </>
  );
}
