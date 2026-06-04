import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderSecurityPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { SecurityPage } = await import(
      "@/components/identity/SecurityForm/Page"
    );
    return renderServerComponent(<SecurityPage />);
  });

export const Route = createFileRoute("/_app/settings/security")({
  staleTime: 0,
  head: ({ match }) =>
    internalRouteHead(
      match.context?.config,
      "セキュリティ",
      "/settings/security",
    ),
  loader: () => renderSecurityPage(),
  component: SecurityRoute,
});

function SecurityRoute() {
  return Route.useLoaderData();
}
