import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderDesignTokensPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { DesignTokensPage } = await import(
      "@/components/admin/DesignTokensForm/Page"
    );
    return renderServerComponent(<DesignTokensPage actorId={actor.id} />);
  });

export const Route = createFileRoute("/admin/design")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  head: ({ match }) =>
    internalRouteHead(
      match.context?.config,
      "デザイントークン",
      "/admin/design",
    ),
  loader: () => renderDesignTokensPage(),
  component: AdminDesignPage,
});

function AdminDesignPage() {
  return Route.useLoaderData();
}
