import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { ErrorPage } from "@/components/public/ErrorPage";
import aboutMd from "@/content/legal/about.md?raw";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";

function applyAboutSubstitutions(
  template: string,
  values: { siteName: string; appUrl: string; twitterHandle: string },
): string {
  return template
    .replaceAll("{{siteName}}", values.siteName)
    .replaceAll("{{appUrl}}", values.appUrl)
    .replaceAll("{{twitterHandle}}", values.twitterHandle);
}

const renderAbout = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const container = await getContainer();
    const { LegalDocument } = await import("@/components/public/LegalDocument");
    const { PublicLayout } = await import("@/components/public/PublicLayout");
    const md = applyAboutSubstitutions(aboutMd, {
      siteName: container.config.siteName,
      appUrl: container.config.appUrl,
      twitterHandle: container.config.twitterHandle ?? "",
    });
    return renderServerComponent(
      <PublicLayout>
        <LegalDocument markdown={md} />
      </PublicLayout>,
    );
  });

export const Route = createFileRoute("/about")({
  staleTime: 60_000,
  loader: () => renderAbout(),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `このインスタンスについて — ${config.siteName}`,
      path: "/about",
    });
  },
  component: AboutPage,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function AboutPage() {
  const Rendered = Route.useLoaderData();
  return <>{Rendered}</>;
}
