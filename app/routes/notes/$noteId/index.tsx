import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

const renderNoteDetail = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ noteId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) {
      throw redirect({ to: "/" });
    }
    const { NoteDetail } = await import("@/components/note/NoteDetail");
    const { AppShell } = await import("@/components/layout/AppShell");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <AppShell user={userDto}>
        <NoteDetail
          user={userDto}
          noteId={
            data.noteId as unknown as Parameters<typeof NoteDetail>[0]["noteId"]
          }
        />
      </AppShell>,
    );
  });

export const Route = createFileRoute("/notes/$noteId/")({
  staleTime: 0,
  loader: ({ params }) => renderNoteDetail({ data: { noteId: params.noteId } }),
  component: NoteDetailRoute,
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

function NoteDetailRoute() {
  return Route.useLoaderData();
}
