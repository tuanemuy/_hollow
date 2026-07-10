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
    // The redirect guard must stay OUTSIDE the Suspense boundary: a
    // `throw redirect()` inside a streamed RSC section does not reach the
    // router (`.issue/12/adr.md` ADR-004).
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { NoteEditorSection } = await import(
      "@/components/note/editor/NoteEditorSection"
    );
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    // Return the Suspense-wrapped section WITHOUT awaiting the note data, so
    // the loader resolves immediately and the editor skeleton streams in
    // right away (matching the detail route). The 3 queries are awaited
    // inside `NoteEditorLoader`, behind the `<Suspense>` boundary.
    return renderServerComponent(
      <NoteEditorSection user={userDto} noteId={data.noteId} />,
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
