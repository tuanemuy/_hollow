import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAuthenticatedRoute } from "@/core/presentation/authGuard";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";

import "@/components/export/ExportForm/action";

export const Route = createFileRoute("/exports")({
  beforeLoad: requireAuthenticatedRoute,
  component: ExportsLayout,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function ExportsLayout() {
  return <Outlet />;
}
