import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderRegistrationPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { RegistrationPage } = await import(
      "@/components/admin/RegistrationForm/Page"
    );
    return renderServerComponent(<RegistrationPage actorId={actor.id} />);
  });

export const Route = createFileRoute("/admin/registration")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "登録制御", "/admin/registration"),
  loader: () => renderRegistrationPage(),
  component: AdminRegistrationPage,
});

function AdminRegistrationPage() {
  return Route.useLoaderData();
}
