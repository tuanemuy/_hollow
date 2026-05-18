import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderJobsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { JobsPage } = await import("@/components/admin/Jobs/Page");
    return renderServerComponent(<JobsPage />);
  });

export const Route = createFileRoute("/admin/jobs")({
  staleTime: 0,
  loader: () => renderJobsPage(),
  component: AdminJobsPage,
});

function AdminJobsPage() {
  return Route.useLoaderData();
}
