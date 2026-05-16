import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderAccountDeletePage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { AccountDeletePage } = await import(
      "@/components/identity/AccountDeleteForm/Page"
    );
    return renderServerComponent(<AccountDeletePage />);
  });

export const Route = createFileRoute("/settings/account-delete")({
  staleTime: 0,
  loader: () => renderAccountDeletePage(),
  component: AccountDeleteRoute,
});

function AccountDeleteRoute() {
  return Route.useLoaderData();
}
