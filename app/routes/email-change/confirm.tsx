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
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function EmailChangeConfirmPage() {
  const { token } = Route.useSearch();
  return (
    <>
      <AuthHeader />
      <main className="auth-shell">
        <div className="auth-card auth-card--centered">
          <EmailChangeConfirm token={token} />
        </div>
      </main>
    </>
  );
}
