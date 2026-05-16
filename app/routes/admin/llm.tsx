import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderLLMSettingsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { LLMSettingsPage } = await import(
      "@/components/admin/LLMSettingsForm/Page"
    );
    return renderServerComponent(<LLMSettingsPage />);
  });

export const Route = createFileRoute("/admin/llm")({
  staleTime: 0,
  loader: () => renderLLMSettingsPage(),
  component: AdminLLMPage,
});

function AdminLLMPage() {
  return Route.useLoaderData();
}
