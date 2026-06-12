import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderNoteEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ noteId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { NoteEditor } = await import("@/components/note/editor/NoteEditor");
    const { loadAllTags, loadDirectoryTreeFlat, loadNoteDetail } = await import(
      "@/components/note/loaders"
    );
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);

    const [detail, tree, tags] = await Promise.all([
      loadNoteDetail({
        actorUserId: userDto.id,
        noteId: data.noteId,
      }),
      loadDirectoryTreeFlat({ actorUserId: userDto.id }),
      loadAllTags({ actorUserId: userDto.id }),
    ]);

    const { note } = detail;

    const initialTagNames = note.tagIds
      .map((id) => tags.byId.get(id))
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
      <NoteEditor
        mode="edit"
        noteId={note.id}
        initialTitle={note.title}
        initialContentHtml={note.contentHtml}
        initialFrontMatter={{ ...note.frontMatter }}
        initialTagNames={initialTagNames}
        initialDirectoryId={note.directoryId}
        {...(initialEditLock !== undefined ? { initialEditLock } : {})}
        tree={tree.flat}
      />,
    );
  });

export const Route = createFileRoute("/_app/notes/$noteId/edit")({
  staleTime: 0,
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `ノートを編集 — ${config.siteName}`,
      path: `/notes/${params.noteId}/edit`,
      noIndex: true,
    });
  },
  loader: ({ params }) => renderNoteEditor({ data: { noteId: params.noteId } }),
  component: NoteEditorRoute,
  errorComponent: RouteErrorFallback,
});

function NoteEditorRoute() {
  return Route.useLoaderData();
}
