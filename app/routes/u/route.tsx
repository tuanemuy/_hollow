import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ErrorPage } from "@/components/public/ErrorPage";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";

export const Route = createFileRoute("/u")({
  component: () => <Outlet />,
  notFoundComponent: () => <ErrorPage kind="notFound" />,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});
