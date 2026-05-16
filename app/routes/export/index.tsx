import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

import "@/components/export/ExportForm/action";

const renderBulkExportPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { ExportFormPage } = await import(
      "@/components/export/ExportForm/Page"
    );
    return renderServerComponent(<ExportFormPage noteId={null} />);
  });

export const Route = createFileRoute("/export/")({
  staleTime: 0,
  loader: () => renderBulkExportPage(),
  component: BulkExportRoute,
});

function BulkExportRoute() {
  return Route.useLoaderData();
}
