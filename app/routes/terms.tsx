import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { ErrorPage } from "@/components/public/ErrorPage";
import termsMd from "@/content/legal/terms.md?raw";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";

const renderTerms = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { LegalDocument } = await import("@/components/public/LegalDocument");
    const { PublicLayout } = await import("@/components/public/PublicLayout");
    return renderServerComponent(
      <PublicLayout>
        <LegalDocument markdown={termsMd} />
      </PublicLayout>,
    );
  });

export const Route = createFileRoute("/terms")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  loader: () => renderTerms(),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `利用規約 — ${config.siteName}`,
      path: "/terms",
    });
  },
  component: TermsPage,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function TermsPage() {
  const Rendered = Route.useLoaderData();
  return <>{Rendered}</>;
}
