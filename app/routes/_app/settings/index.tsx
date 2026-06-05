import { createFileRoute, redirect } from "@tanstack/react-router";

// `/settings` has no content of its own; the settings sub-nav lives in the
// `_app` shell. Redirect bare `/settings` to the default section so a direct
// hit never renders an empty main area (Issue #487).
export const Route = createFileRoute("/_app/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/profile" });
  },
});
