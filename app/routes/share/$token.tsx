import { createFileRoute } from "@tanstack/react-router";
import { ErrorPage } from "@/components/public/ErrorPage";
import { PublicLayout } from "@/components/public/PublicLayout";
import { ShareLinkGate } from "@/components/public/ShareLinkGate";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { buildHead } from "@/core/presentation/head";

// Pull the action module into the server-rendered route graph so the
// rsc manifest registers the `useServerFn`-bound provider before any
// `"use client"` component reaches for it.
import "@/components/public/ShareLinkGate/action";

export const Route = createFileRoute("/share/$token")({
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `共有リンク — ${config.siteName}`,
      path: `/share/${params.token}`,
    });
  },
  component: ShareLinkPage,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function ShareLinkPage() {
  const { token } = Route.useParams();
  return (
    <PublicLayout hideHeaderSearch>
      <ShareLinkGate token={token} />
    </PublicLayout>
  );
}
