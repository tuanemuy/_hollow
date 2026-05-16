import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderRegistrationPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { RegistrationPage } = await import(
      "@/components/admin/RegistrationForm/Page"
    );
    return renderServerComponent(<RegistrationPage />);
  });

export const Route = createFileRoute("/admin/registration")({
  staleTime: 0,
  loader: () => renderRegistrationPage(),
  component: AdminRegistrationPage,
});

function AdminRegistrationPage() {
  return Route.useLoaderData();
}
