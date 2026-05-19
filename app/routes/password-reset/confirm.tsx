import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { PasswordResetConfirmForm } from "@/components/auth/PasswordResetConfirmForm";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

const passwordResetConfirmSearch = z.object({
  token: z.string().trim().min(1).max(256),
});

export const Route = createFileRoute("/password-reset/confirm")({
  validateSearch: (search) => passwordResetConfirmSearch.parse(search),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, {
      path: "/password-reset/confirm",
      title: "新しいパスワードを設定",
    });
    return { meta, links };
  },
  component: PasswordResetConfirmPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap">
        {sanitizeRouteError(error)}
      </pre>
    </div>
  ),
});

function PasswordResetConfirmPage() {
  const { token } = Route.useSearch();
  return (
    <>
      <AuthHeader />
      <main className="min-h-[calc(100vh-var(--header-height))] flex items-start justify-center px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-20 lg:pt-20">
        <div className="w-full max-w-[440px] mx-auto">
          <PasswordResetConfirmForm token={token} />
        </div>
      </main>
    </>
  );
}
