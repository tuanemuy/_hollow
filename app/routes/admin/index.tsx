import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderAdminDashboard = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { AdminDashboard } = await import("@/components/admin/Dashboard");
    return renderServerComponent(<AdminDashboard />);
  });

export const Route = createFileRoute("/admin/")({
  staleTime: 0,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "管理ダッシュボード", "/admin"),
  loader: () => renderAdminDashboard(),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  return Route.useLoaderData();
}
