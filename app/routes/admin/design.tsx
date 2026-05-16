import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderDesignTokensPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { DesignTokensPage } = await import(
      "@/components/admin/DesignTokensForm/Page"
    );
    return renderServerComponent(<DesignTokensPage />);
  });

export const Route = createFileRoute("/admin/design")({
  staleTime: 0,
  loader: () => renderDesignTokensPage(),
  component: AdminDesignPage,
});

function AdminDesignPage() {
  return Route.useLoaderData();
}
