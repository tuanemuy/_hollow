import { createFileRoute } from "@tanstack/react-router";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { PasswordResetRequestForm } from "@/components/auth/PasswordResetRequestForm";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

export const Route = createFileRoute("/password-reset/")({
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, {
      path: "/password-reset",
      title: "パスワードを再設定",
    });
    return { meta, links };
  },
  component: PasswordResetRequestPage,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function PasswordResetRequestPage() {
  return (
    <>
      <AuthHeader />
      <main className="auth-shell">
        <div className="auth-card">
          <PasswordResetRequestForm />
        </div>
      </main>
    </>
  );
}
