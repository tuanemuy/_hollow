import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { LandingPage } from "@/components/landing/LandingPage";
import {
  type NoteListSearch,
  noteListSearchSchema,
} from "@/components/note/schema";
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
// Kept as a safety-net even though `AppShell` also registers the
// ingestion actions: the home route is the most common entry path
// for upload-from-modal, and explicit registration here insulates
// the manifest from any future change to AppShell's import chain.
import "@/components/ingestion/actions";
import "@/components/view/actions";
import "@/components/media/actions";
import "@/components/publication/PublishSettings/action";

/**
 * `loaderDeps` returns the search shape minus `display` so that
 * switching list/tile/calendar does not invalidate the loader cache
 * (Issue #219). `display` is a pure client-side rendering concern —
 * it never reaches a usecase. The home loader still forwards the
 * value to the server fn for the SavedView-redirect decision (see
 * the `viewId` branch below), but the handler tolerates `undefined`
 * because it's no longer part of the dedup key.
 *
 * The structural parameter shape lets tanstack-router infer its own
 * `FullSearchSchemaOption` generic at the route boundary; the test
 * passes a `NoteListSearch` literal directly.
 */
export const homeLoaderDeps = <T extends NoteListSearch>({
  search,
}: {
  search: T;
}): Omit<T, "display"> => {
  const { display: _display, ...rest } = search;
  return rest;
};

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
        loadReferencingNoteTitle,
      },
      { shouldRedirectForSavedView, viewQueryToSearch },
    ] = await Promise.all([
      import("@/components/note/HomePage"),
      import("@/core/application/dto/identity"),
      import("@/components/note/loaders"),
      import("@/components/note/list/listSelectors"),
    ]);
    const userDto = toUserDTO(user);

    // Resolve viewId-driven base search first so it can seed the listing
    // call. Explicit URL fields still win over the SavedView snapshot.
    let baseSearch = search;
    if (search.viewId !== undefined) {
      const [{ view }, { byId: tagNameById }] = await Promise.all([
        loadSavedViewById({
          actorUserId: user.id,
          viewId: search.viewId,
        }),
        loadAllTags({ actorUserId: user.id }),
      ]);
      // SavedView restore — normalise URL so the client `useSearch`-driven
      // display can mirror the stored `displayMode` (Issue #219 ADR-002).
      // `shouldRedirectForSavedView` encodes the full predicate (viewId
      // present, display absent, view resolved) so the branch can be
      // regression-tested as a pure function.
      if (shouldRedirectForSavedView({ search, view })) {
        throw redirect({
          to: "/",
          search: { ...search, display: view?.displayMode },
        });
      }
      if (view !== null) {
        const restored = viewQueryToSearch(view, (tagIds) =>
          tagIds
            .map((id) => tagNameById.get(id))
            .filter((name): name is string => name !== undefined),
        );
        baseSearch = {
          ...restored,
          ...search,
        };
      }
    }

    const [owned, tree, tags, savedViews, referencing] = await Promise.all([
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
        ...(baseSearch.referencingNoteId !== undefined
          ? { referencingNoteId: baseSearch.referencingNoteId }
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
      baseSearch.referencingNoteId !== undefined
        ? loadReferencingNoteTitle({
            actorUserId: user.id,
            noteId: baseSearch.referencingNoteId,
          })
        : Promise.resolve({ title: null as string | null }),
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
          referencingNoteTitle={referencing.title}
        />,
      ),
    };
  });

export const Route = createFileRoute("/")({
  staleTime: 0,
  // Unified with the rest of the routes via `schema.parse(search)`
  // (Issue #13 ADR-001 supersedes Issue #1 ADR-026). Callers using
  // `<Link to="/">` / `redirect({ to: "/" })` must pass
  // `search={HOME_SEARCH}` from `@/components/auth/links`.
  validateSearch: (search) => noteListSearchSchema.parse(search),
  loaderDeps: homeLoaderDeps,
  // `display` is intentionally stripped from `deps` (Issue #219 ADR-004)
  // so view switches do not re-run the loader. We still forward the
  // current URL value to the server fn so the SavedView redirect can
  // decide whether to normalise the URL — only the initial loader
  // invocation observes a meaningful `display` value, and subsequent
  // display-only changes do not re-enter the loader.
  loader: ({ deps, location }) => {
    // `location.search` is generically typed as `{}` at this call site
    // because tanstack-router has not yet projected the validated search
    // through the loader signature. Cast back to `NoteListSearch` to
    // recover the `display` field — `validateSearch` above is the
    // single source of truth for the shape and runs before the loader
    // (see Issue #219 ADR-004).
    const search = location.search as NoteListSearch;
    return renderHome({
      data: { ...deps, display: search.display },
    });
  },
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, { path: "/" });
    return { meta, links };
  },
  component: HomeRoute,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap">
        {sanitizeRouteError(error)}
      </pre>
    </div>
  ),
});

function HomeRoute() {
  const data = Route.useLoaderData();
  if (!data.authenticated) return <LandingPage />;
  return data.Home;
}
