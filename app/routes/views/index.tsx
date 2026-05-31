import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderSavedViewsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(z.object({ kind: z.enum(["personal", "public"]) })),
  )
  .handler(async ({ data }) => {
    const { SavedViewsListPage } = await import(
      "@/components/view/SavedViewsList/Page"
    );
    return renderServerComponent(<SavedViewsListPage kind={data.kind} />);
  });

const viewsSearchSchema = z.object({
  kind: z.enum(["personal", "public"]).catch("personal"),
});

export const Route = createFileRoute("/views/")({
  staleTime: 0,
  validateSearch: (search) => viewsSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "ビュー", "/views"),
  loader: ({ deps }) => renderSavedViewsPage({ data: { kind: deps.kind } }),
  component: ViewsRoute,
});

function ViewsRoute() {
  return Route.useLoaderData();
}
