import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderUsersPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const me = await requireAdminUser();
    const { UsersPage } = await import("@/components/admin/UsersTable/Page");
    return renderServerComponent(<UsersPage currentUserId={me.id} />);
  });

export const Route = createFileRoute("/admin/users")({
  staleTime: 0,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "ユーザー", "/admin/users"),
  loader: () => renderUsersPage(),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  return Route.useLoaderData();
}
