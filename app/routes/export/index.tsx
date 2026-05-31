import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { requireAuthenticatedRoute } from "@/core/presentation/authGuard";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

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
  beforeLoad: requireAuthenticatedRoute,
  staleTime: 0,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "一括エクスポート", "/export"),
  loader: () => renderBulkExportPage(),
  component: BulkExportRoute,
});

function BulkExportRoute() {
  return Route.useLoaderData();
}
