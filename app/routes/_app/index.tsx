import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { useAuthGuardEffect } from "@/components/common/useAuthGuardEffect";
import { LandingPage } from "@/components/landing/LandingPage";
import {
  NOTE_LIST_LIMIT_DEFAULT,
  NOTE_LIST_PAGE_DEFAULT,
} from "@/components/note/constants";
import {
  type NoteListSearch,
  noteListSearchSchema,
} from "@/components/note/schema";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

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
      { loadAllTags, loadSavedViewById },
      { shouldRedirectForSavedView, viewQueryToSearch },
    ] = await Promise.all([
      import("@/components/note/HomePage"),
      import("@/components/note/loaders"),
      import("@/components/note/list/listSelectors"),
    ]);

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

    // Issue #215: `noteListSearchSchema` keeps `page` / `limit` optional
    // on its output to drop default pagination from the URL. Fall back
    // here so loaders / DTOs continue to receive concrete numbers.
    const pageForLoad = baseSearch.page ?? NOTE_LIST_PAGE_DEFAULT;
    const limitForLoad = baseSearch.limit ?? NOTE_LIST_LIMIT_DEFAULT;

    // Issue #636: data loading moved into HomePage's per-section async
    // server components so each section streams behind its own
    // `<Suspense>` boundary. Only auth / SavedView normalisation (which
    // may `redirect`) and page/limit resolution stay in the handler.
    return {
      authenticated: true as const,
      Home: await renderServerComponent(
        <HomePage
          userId={user.id}
          page={pageForLoad}
          limit={limitForLoad}
          search={baseSearch}
        />,
      ),
    };
  });

export const Route = createFileRoute("/_app/")({
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

const appLayoutRoute = getRouteApi("/_app");

function HomeRoute() {
  const data = Route.useLoaderData();
  const { userDto: shellUserDto } = appLayoutRoute.useLoaderData();
  // Call the hook unconditionally above the conditional return to comply
  // with the rules of hooks. The hook itself is no-op unless the
  // `shell cached user × leaf observed unauthenticated` mismatch holds.
  useAuthGuardEffect({
    leafAuthenticated: data.authenticated,
    shellUserDto,
  });
  if (!data.authenticated) return <LandingPage />;
  return data.Home;
}
