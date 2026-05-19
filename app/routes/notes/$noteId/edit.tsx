import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

const renderNoteEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ noteId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { AppShell } = await import("@/components/layout/AppShell");
    const { NoteEditor } = await import("@/components/note/editor/NoteEditor");
    const { loadAllTags, loadDirectoryTreeFlat, loadNoteDetail } = await import(
      "@/components/note/loaders"
    );
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);

    const [detail, tree, tags] = await Promise.all([
      loadNoteDetail({
        actorUserId: userDto.id,
        noteId: data.noteId as unknown as Parameters<
          typeof loadNoteDetail
        >[0]["noteId"],
      }),
      loadDirectoryTreeFlat({ actorUserId: userDto.id }),
      loadAllTags({ actorUserId: userDto.id }),
    ]);

    const { note } = detail;

    const initialTagNames = note.tagIds
      .map((id) => tags.byId.get(id as unknown as string))
      .filter((name): name is string => name !== undefined);

    const initialEditLock =
      note.editLock === null
        ? undefined
        : ({
            state: "acquired",
            lockId: null,
            expiresAt: new Date(note.editLock.expiresAt).getTime(),
          } as const);

    return renderServerComponent(
      <AppShell user={userDto}>
        <NoteEditor
          mode="edit"
          noteId={note.id as unknown as string}
          initialTitle={note.title}
          initialContentHtml={note.contentHtml}
          initialFrontMatter={{ ...note.frontMatter }}
          initialTagNames={initialTagNames}
          initialDirectoryId={note.directoryId as unknown as string}
          {...(initialEditLock !== undefined ? { initialEditLock } : {})}
          tree={tree.flat}
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
