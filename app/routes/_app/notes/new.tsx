import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { HOME_SEARCH } from "@/components/auth/links";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";

const renderNewNote = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
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

    return renderServerComponent(<NoteEditor mode="new" tree={tree.flat} />);
  });

export const Route = createFileRoute("/_app/notes/new")({
  staleTime: 0,
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `新規ノート — ${config.siteName}`,
      path: "/notes/new",
      noIndex: true,
    });
  },
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
