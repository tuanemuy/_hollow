import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderJobsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { JobsPage } = await import("@/components/admin/Jobs/Page");
    return renderServerComponent(<JobsPage />);
  });

export const Route = createFileRoute("/admin/jobs")({
  staleTime: 0,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "ジョブ監視", "/admin/jobs"),
  loader: () => renderJobsPage(),
  component: AdminJobsPage,
});

function AdminJobsPage() {
  return Route.useLoaderData();
}
