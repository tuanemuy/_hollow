import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderMetricsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { MetricsPage } = await import("@/components/admin/Metrics");
    return renderServerComponent(<MetricsPage actorId={actor.id} />);
  });

export const Route = createFileRoute("/admin/metrics")({
  staleTime: 0,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "利用状況", "/admin/metrics"),
  loader: () => renderMetricsPage(),
  component: AdminMetricsPage,
});

function AdminMetricsPage() {
  return Route.useLoaderData();
}
