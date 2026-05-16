import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderMetricsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { MetricsPage } = await import("@/components/admin/Metrics");
    return renderServerComponent(<MetricsPage />);
  });

export const Route = createFileRoute("/admin/metrics")({
  staleTime: 0,
  loader: () => renderMetricsPage(),
  component: AdminMetricsPage,
});

function AdminMetricsPage() {
  return Route.useLoaderData();
}
