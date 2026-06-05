import { createFileRoute, Outlet } from "@tanstack/react-router";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
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
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function ViewsLayout() {
  return <Outlet />;
}
