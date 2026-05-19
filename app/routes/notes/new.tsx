import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { HOME_SEARCH } from "@/components/auth/links";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderNewNote = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { AppShell } = await import("@/components/layout/AppShell");
    const { NoteEditor } = await import("@/components/note/editor/NoteEditor");
    const { loadDirectoryTreeFlat, loadAllTags } = await import(
      "@/components/note/loaders"
    );
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);

    const [tree] = await Promise.all([
      loadDirectoryTreeFlat({ actorUserId: userDto.id }),
      // Tag list is preloaded so the autocomplete cache is warm when the
      // editor renders; the component itself reads tags through the
      // free-form text input today, but the cache primes future autocomplete.
      loadAllTags({ actorUserId: userDto.id }),
    ]);

    return renderServerComponent(
      <AppShell user={userDto}>
        <NoteEditor mode="new" tree={tree.flat} />
      </AppShell>,
    );
  });

export const Route = createFileRoute("/notes/new")({
  staleTime: 0,
  loader: () => renderNewNote(),
  component: NewNoteRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function NewNoteRoute() {
  return Route.useLoaderData();
}
