import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderSecurityPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentSessionToken, requireCurrentUser } = await import(
      "@/lib/server/currentUser"
    );
    const user = await requireCurrentUser();
    const token = getCurrentSessionToken();
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const { SecurityPage } = await import(
      "@/components/identity/SecurityForm/Page"
    );
    return renderServerComponent(
      <SecurityPage user={toUserDTO(user)} sessionToken={token} />,
    );
  });

export const Route = createFileRoute("/_app/settings/security")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
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
