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
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function PasswordResetConfirmPage() {
  const { token } = Route.useSearch();
  return (
    <>
      <AuthHeader />
      <main className="auth-shell">
        <div className="auth-card">
          <PasswordResetConfirmForm token={token} />
        </div>
      </main>
    </>
  );
}
