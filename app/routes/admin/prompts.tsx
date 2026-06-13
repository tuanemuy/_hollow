import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderPromptsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { PromptsPage } = await import("@/components/admin/PromptsForm/Page");
    return renderServerComponent(<PromptsPage actorId={actor.id} />);
  });

export const Route = createFileRoute("/admin/prompts")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "プロンプト", "/admin/prompts"),
  loader: () => renderPromptsPage(),
  component: AdminPromptsPage,
});

function AdminPromptsPage() {
  return Route.useLoaderData();
}
