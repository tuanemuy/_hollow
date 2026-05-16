import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderPromptsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { PromptsPage } = await import(
      "@/components/identity/PromptsForm/Page"
    );
    return renderServerComponent(<PromptsPage />);
  });

export const Route = createFileRoute("/settings/prompts")({
  staleTime: 0,
  loader: () => renderPromptsPage(),
  component: PromptsRoute,
});

function PromptsRoute() {
  return Route.useLoaderData();
}
