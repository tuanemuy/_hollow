import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import { buildHead } from "@/core/presentation/head";

export const Route = createFileRoute("/_app/notes/$noteId/history")({
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `変更履歴 — ${config.siteName}`,
      path: `/notes/${params.noteId}/history`,
      noIndex: true,
    });
  },
  component: NoteHistoryLayout,
  errorComponent: RouteErrorFallback,
});

function NoteHistoryLayout() {
  return <Outlet />;
}
