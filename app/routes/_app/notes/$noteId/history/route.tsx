import { createFileRoute, Outlet } from "@tanstack/react-router";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
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
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
  notFoundComponent: () => (
    <div role="alert">
      <h1>ノートが見つかりません</h1>
      <p>削除されているか、アクセス権限がありません。</p>
    </div>
  ),
});

function NoteHistoryLayout() {
  return <Outlet />;
}
