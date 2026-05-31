import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAuthenticatedRoute } from "@/core/presentation/authGuard";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

import "@/components/export/ExportForm/action";

export const Route = createFileRoute("/exports")({
  beforeLoad: requireAuthenticatedRoute,
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `エクスポート — ${config.siteName}`,
      noIndex: true,
    });
  },
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
