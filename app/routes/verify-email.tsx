import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { VerifyEmail } from "@/components/auth/VerifyEmail";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

const verifyEmailSearchSchema = z.object({
  token: z.string().trim().min(1).max(256),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search) => verifyEmailSearchSchema.parse(search),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, {
      path: "/verify-email",
      title: "メールアドレスを確認",
    });
    return { meta, links };
  },
  component: VerifyEmailPage,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  return (
    <>
      <AuthHeader />
      <main className="auth-shell">
        <div className="auth-card auth-card--centered">
          <VerifyEmail token={token} />
        </div>
      </main>
    </>
  );
}
