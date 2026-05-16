import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderAdminDashboard = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { AdminDashboard } = await import("@/components/admin/Dashboard");
    return renderServerComponent(<AdminDashboard />);
  });

export const Route = createFileRoute("/admin/")({
  staleTime: 0,
  loader: () => renderAdminDashboard(),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  return Route.useLoaderData();
}
