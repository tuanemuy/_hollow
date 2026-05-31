import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderMetricsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { MetricsPage } = await import("@/components/admin/Metrics");
    return renderServerComponent(<MetricsPage />);
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
