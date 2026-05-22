import { createFileRoute, Outlet } from "@tanstack/react-router";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";

export const Route = createFileRoute("/notes/$noteId/history")({
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
