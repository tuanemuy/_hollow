import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderAccountDeletePage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { AccountDeletePage } = await import(
      "@/components/identity/AccountDeleteForm/Page"
    );
    return renderServerComponent(<AccountDeletePage />);
  });

export const Route = createFileRoute("/_app/settings/account-delete")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  head: ({ match }) =>
    internalRouteHead(
      match.context?.config,
      "アカウント削除",
      "/settings/account-delete",
    ),
  loader: () => renderAccountDeletePage(),
  component: AccountDeleteRoute,
});

function AccountDeleteRoute() {
  return Route.useLoaderData();
}
