import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import { buildHead } from "@/core/presentation/head";

import "@/components/export/ExportForm/action";

export const Route = createFileRoute("/_app/exports")({
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `エクスポート — ${config.siteName}`,
      noIndex: true,
    });
  },
  component: ExportsLayout,
  errorComponent: RouteErrorFallback,
});

function ExportsLayout() {
  return <Outlet />;
}
