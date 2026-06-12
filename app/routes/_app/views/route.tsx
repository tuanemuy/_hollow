import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import { buildHead } from "@/core/presentation/head";

import "@/components/view/SavedViewsList/action";

export const Route = createFileRoute("/_app/views")({
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `ビュー — ${config.siteName}`,
      noIndex: true,
    });
  },
  component: ViewsLayout,
  errorComponent: RouteErrorFallback,
});

function ViewsLayout() {
  return <Outlet />;
}
