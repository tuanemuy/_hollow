import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderProfilePage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { ProfilePage } = await import(
      "@/components/identity/ProfileForm/Page"
    );
    return renderServerComponent(<ProfilePage />);
  });

export const Route = createFileRoute("/settings/profile")({
  staleTime: 0,
  loader: () => renderProfilePage(),
  component: ProfileRoute,
});

function ProfileRoute() {
  return Route.useLoaderData();
}
