import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { HOME_SEARCH } from "@/components/auth/links";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
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

    const [tree, tags] = await Promise.all([
      loadDirectoryTreeFlat({ actorUserId: userDto.id }),
      loadAllTags({ actorUserId: userDto.id }),
    ]);

    return renderServerComponent(
      <NoteEditor
        mode="new"
        tree={tree.flat}
        tagSuggestions={tags.tags.map((t) => t.name)}
      />,
    );
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
  errorComponent: RouteErrorFallback,
});

function NewNoteRoute() {
  return Route.useLoaderData();
}
