import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

const renderExportJobsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(
      z.object({
        offset: z.number().int().min(0).max(10_000),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { ExportJobsPage } = await import(
      "@/components/export/ExportJobsList/Page"
    );
    return renderServerComponent(<ExportJobsPage offset={data.offset} />);
  });

const exportsSearchSchema = z.object({
  offset: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export const Route = createFileRoute("/exports/")({
  staleTime: 0,
  validateSearch: (search) => exportsSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => renderExportJobsPage({ data: { offset: deps.offset } }),
  component: ExportsRoute,
});

function ExportsRoute() {
  return Route.useLoaderData();
}
