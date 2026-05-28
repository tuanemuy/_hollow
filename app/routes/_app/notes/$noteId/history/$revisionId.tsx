import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

const renderRevision = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(
      z.object({
        noteId: z.string().min(1),
        revisionId: z.string().min(1),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { NoteRevisionDetail } = await import(
      "@/components/note/history/NoteRevisionDetail"
    );
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <NoteRevisionDetail
        user={userDto}
        noteId={
          data.noteId as unknown as Parameters<
            typeof NoteRevisionDetail
          >[0]["noteId"]
        }
        revisionId={
          data.revisionId as unknown as Parameters<
            typeof NoteRevisionDetail
          >[0]["revisionId"]
        }
      />,
    );
  });

export const Route = createFileRoute("/_app/notes/$noteId/history/$revisionId")(
  {
    staleTime: 0,
    loader: ({ params }) =>
      renderRevision({
        data: { noteId: params.noteId, revisionId: params.revisionId },
      }),
    component: NoteRevisionRoute,
    errorComponent: ({ error }) => (
      <div role="alert">
        <h1>エラーが発生しました</h1>
        <pre>{sanitizeRouteError(error)}</pre>
      </div>
    ),
    notFoundComponent: () => (
      <div role="alert">
        <h1>過去版が見つかりません</h1>
        <p>削除されているか、アクセス権限がありません。</p>
      </div>
    ),
  },
);

function NoteRevisionRoute() {
  return Route.useLoaderData();
}
