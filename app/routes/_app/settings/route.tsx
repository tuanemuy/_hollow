import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  SETTINGS_ERROR_BODY,
  SETTINGS_ERROR_BOX,
  SETTINGS_ERROR_TITLE,
} from "@/components/identity/styles";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

// Register server-fn handlers with the RSC manifest before the client
// bundle freezes it.
import "@/components/identity/ProfileForm/action";
import "@/components/identity/SecurityForm/action";
import "@/components/identity/PromptsForm/action";
import "@/components/identity/AccountDeleteForm/action";

export const Route = createFileRoute("/_app/settings")({
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `設定 — ${config.siteName}`,
      noIndex: true,
    });
  },
  component: SettingsLayout,
  errorComponent: ({ error }) => (
    <div role="alert" className={SETTINGS_ERROR_BOX}>
      <h1 className={SETTINGS_ERROR_TITLE}>エラーが発生しました</h1>
      <pre className={SETTINGS_ERROR_BODY}>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function SettingsLayout() {
  return <Outlet />;
}
