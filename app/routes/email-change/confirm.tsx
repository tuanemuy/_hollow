import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { EmailChangeConfirm } from "@/components/auth/EmailChangeConfirm";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

const emailChangeConfirmSearch = z.object({
  token: z.string().trim().min(1).max(256),
});

export const Route = createFileRoute("/email-change/confirm")({
  validateSearch: (search) => emailChangeConfirmSearch.parse(search),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, {
      path: "/email-change/confirm",
      title: "メールアドレスを変更",
    });
    return { meta, links };
  },
  component: EmailChangeConfirmPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap">
        {sanitizeRouteError(error)}
      </pre>
    </div>
  ),
});

function EmailChangeConfirmPage() {
  const { token } = Route.useSearch();
  return (
    <>
      <AuthHeader />
      <main className="min-h-[calc(100vh-var(--header-height))] flex items-start justify-center px-4 pt-10 pb-16 sm:px-6 sm:pt-16 sm:pb-20 lg:pt-20">
        <div className="w-full max-w-[440px] mx-auto text-center">
          <EmailChangeConfirm token={token} />
        </div>
      </main>
    </>
  );
}
