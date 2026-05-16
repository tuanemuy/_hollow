import { createFileRoute, Outlet } from "@tanstack/react-router";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";

import "@/components/export/ExportForm/action";

export const Route = createFileRoute("/exports")({
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
