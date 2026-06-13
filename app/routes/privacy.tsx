import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { ErrorPage } from "@/components/public/ErrorPage";
import privacyMd from "@/content/legal/privacy.md?raw";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";

const renderPrivacy = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { LegalDocument } = await import("@/components/public/LegalDocument");
    const { PublicLayout } = await import("@/components/public/PublicLayout");
    return renderServerComponent(
      <PublicLayout>
        <LegalDocument markdown={privacyMd} />
      </PublicLayout>,
    );
  });

export const Route = createFileRoute("/privacy")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  loader: () => renderPrivacy(),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `プライバシーポリシー — ${config.siteName}`,
      path: "/privacy",
    });
  },
  component: PrivacyPage,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function PrivacyPage() {
  const Rendered = Route.useLoaderData();
  return <>{Rendered}</>;
}
