import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { LandingPage } from "@/components/landing/LandingPage";
import { noteListSearchSchema } from "@/components/note/schema";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

// Pull server-fn provider modules into the server graph so the RSC
// manifest registers them before the client build phase. Without these,
// "use client" components that import the action files at runtime hit a
// missing-handler error.
import "@/components/note/actions";
import "@/components/directory/actions";
import "@/components/tag/actions";
import "@/components/ingestion/actions";
import "@/components/view/actions";
import "@/components/media/actions";
import "@/components/publication/PublishSettings/action";

const renderHome = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(noteListSearchSchema))
  .handler(async ({ data: search }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) {
      return { authenticated: false as const };
    }
    const [
      { HomePage },
      { toUserDTO },
      {
        loadOwnedNotes,
        loadDirectoryTreeFlat,
        loadAllTags,
        loadSavedViewsByKind,
        loadSavedViewById,
      },
    ] = await Promise.all([
      import("@/components/note/HomePage"),
      import("@/core/application/dto/identity"),
      import("@/components/note/loaders"),
    ]);
    const userDto = toUserDTO(user);

    // Resolve viewId-driven base search first so it can seed the listing
    // call. Explicit URL fields still win over the SavedView snapshot.
    let baseSearch = search;
    if (search.viewId !== undefined) {
      const { view } = await loadSavedViewById({
        actorUserId: user.id,
        viewId: search.viewId,
      });
      if (view !== null) {
        baseSearch = {
          ...search,
          display: search.display ?? view.displayMode,
          directoryId:
            search.directoryId ??
            (view.query.directoryId === null
              ? undefined
              : (view.query.directoryId as unknown as string)),
          q: search.q ?? view.query.keyword ?? undefined,
        };
      }
    }

    const [owned, tree, tags, savedViews] = await Promise.all([
      loadOwnedNotes({
        actorUserId: user.id,
        status: "active",
        page: baseSearch.page,
        limit: baseSearch.limit,
        ...(baseSearch.directoryId !== undefined
          ? { directoryId: baseSearch.directoryId }
          : {}),
        ...(baseSearch.q !== undefined ? { q: baseSearch.q } : {}),
        ...(baseSearch.tagNames !== undefined
          ? { tagNames: baseSearch.tagNames }
          : {}),
        ...(baseSearch.visibility !== undefined
          ? { visibility: baseSearch.visibility }
          : {}),
        ...(baseSearch.from !== undefined || baseSearch.to !== undefined
          ? {
              dateRange: {
                from: baseSearch.from ?? null,
                to: baseSearch.to ?? null,
              },
            }
          : {}),
      }),
      loadDirectoryTreeFlat({ actorUserId: user.id }),
      loadAllTags({ actorUserId: user.id }),
      loadSavedViewsByKind({ actorUserId: user.id, kind: "personal" }),
    ]);

    return {
      authenticated: true as const,
      Home: await renderServerComponent(
        <HomePage
          user={userDto}
          page={baseSearch.page}
          limit={baseSearch.limit}
          owned={owned}
          tree={tree.flat}
          tags={tags.tags}
          savedViews={savedViews.views}
          search={baseSearch}
        />,
      ),
    };
  });

export const Route = createFileRoute("/")({
  staleTime: 0,
  // Note: other routes use `(search) => schema.parse(search)` directly, but
  // the home route keeps the `validateInput()` wrapper. The wrapper widens
  // the `search` parameter to `unknown`, which lets TanStack's inferred
  // search union (across all routes) coexist with `<Link to="/">` /
  // `redirect({ to: "/" })` callers that omit the `search` prop. Direct
  // `parse(search)` would narrow the input type and force every link
  // target to spell out the full search shape.
  validateSearch: validateInput(noteListSearchSchema),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => renderHome({ data: deps }),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, { path: "/" });
    return { meta, links };
  },
  component: HomeRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function HomeRoute() {
  const data = Route.useLoaderData();
  if (!data.authenticated) return <LandingPage />;
  return data.Home;
}
