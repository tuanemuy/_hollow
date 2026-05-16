import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderUsersPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { UsersPage } = await import("@/components/admin/UsersTable/Page");
    return renderServerComponent(<UsersPage />);
  });

export const Route = createFileRoute("/admin/users")({
  staleTime: 0,
  loader: () => renderUsersPage(),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  return Route.useLoaderData();
}
