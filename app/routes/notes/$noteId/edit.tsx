import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

const renderNoteEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ noteId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) throw redirect({ to: "/" });
    const { AppShell } = await import("@/components/layout/AppShell");
    const { NoteEditor } = await import("@/components/note/NoteEditor");
    const { loadNoteDetail } = await import("@/components/note/loaders");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);

    const { note } = await loadNoteDetail({
      actorUserId: userDto.id,
      noteId: data.noteId as unknown as Parameters<
        typeof loadNoteDetail
      >[0]["noteId"],
    });

    const { listTags } = await import("@/core/application/tag/listTags");
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const container = await getContainer();
    const { tags } = await listTags({
      container,
      input: { actorUserId: userDto.id, limit: 200 },
    });
    const tagMap = new Map(
      tags.map((tag) => [tag.id as unknown as string, tag.name]),
    );
    const initialTagNames = note.tagIds
      .map((id) => tagMap.get(id as unknown as string))
      .filter((name): name is string => name !== undefined);

    return renderServerComponent(
      <AppShell user={userDto}>
        <NoteEditor
          mode="edit"
          noteId={note.id as unknown as string}
          initialTitle={note.title}
          initialContentHtml={note.contentHtml}
          initialTagNames={initialTagNames}
        />
      </AppShell>,
    );
  });

export const Route = createFileRoute("/notes/$noteId/edit")({
  staleTime: 0,
  loader: ({ params }) => renderNoteEditor({ data: { noteId: params.noteId } }),
  component: NoteEditorRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function NoteEditorRoute() {
  return Route.useLoaderData();
}
