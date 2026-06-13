import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderLLMSettingsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { LLMSettingsPage } = await import(
      "@/components/admin/LLMSettingsForm/Page"
    );
    return renderServerComponent(<LLMSettingsPage actorId={actor.id} />);
  });

export const Route = createFileRoute("/admin/llm")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "LLM 設定", "/admin/llm"),
  loader: () => renderLLMSettingsPage(),
  component: AdminLLMPage,
});

function AdminLLMPage() {
  return Route.useLoaderData();
}
