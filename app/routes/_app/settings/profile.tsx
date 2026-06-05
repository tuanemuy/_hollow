import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderProfilePage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { ProfilePage } = await import(
      "@/components/identity/ProfileForm/Page"
    );
    return renderServerComponent(<ProfilePage />);
  });

export const Route = createFileRoute("/_app/settings/profile")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  head: ({ match }) =>
    internalRouteHead(
      match.context?.config,
      "プロフィール",
      "/settings/profile",
    ),
  loader: () => renderProfilePage(),
  component: ProfileRoute,
});

function ProfileRoute() {
  return Route.useLoaderData();
}
