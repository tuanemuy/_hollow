import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAuthenticatedRoute } from "@/core/presentation/authGuard";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";

import "@/components/view/SavedViewsList/action";

export const Route = createFileRoute("/views")({
  beforeLoad: requireAuthenticatedRoute,
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
