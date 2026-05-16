import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

import "@/components/export/ExportForm/action";

const renderSingleExportPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ noteId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { ExportFormPage } = await import(
      "@/components/export/ExportForm/Page"
    );
    return renderServerComponent(<ExportFormPage noteId={data.noteId} />);
  });

export const Route = createFileRoute("/notes/$noteId/export")({
  staleTime: 0,
  loader: ({ params }) =>
    renderSingleExportPage({ data: { noteId: params.noteId } }),
  component: SingleExportRoute,
});

function SingleExportRoute() {
  return Route.useLoaderData();
}
