import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { ErrorPage } from "@/components/public/ErrorPage";
import { PUBLIC_ROUTE_GC_TIME } from "@/components/public/routeCache";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import {
  buildHead,
  buildJsonLdScript,
  joinUrl,
} from "@/core/presentation/head";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
  paginationSchema,
  paginationSearchSchema,
} from "@/core/presentation/pagination";
import { validateInput } from "@/core/presentation/validator";

// P30 filter/sort/display search params. `tags` AND-filters the
// public listing (server re-fetch — loader dep); `sort` picks the listing
// axis (server re-fetch — loader dep); `display` is a client-only layout
// swap (list/tile/calendar) and is intentionally **excluded** from
// `loaderDeps` so toggling it never re-streams the RSC (ADR-004, the
// `DisplayModeSwitch` technique). `.catch(...)` keeps hand-typed junk from
// erroring the route; omission keeps the URL clean.
const PUBLIC_SORTS = [
  "publishedAt",
  "updatedAt",
  "createdAt",
  "title",
] as const;
const DISPLAY_MODES = ["list", "tile", "calendar"] as const;

const publicTopSearchSchema = paginationSearchSchema.extend({
  tags: z.array(z.string().min(1).max(64)).max(8).optional().catch(undefined),
  sort: z.enum(PUBLIC_SORTS).optional().catch(undefined),
  display: z.enum(DISPLAY_MODES).optional().catch(undefined),
  // Published date range filter: `YYYY-MM-DD`. Server-driven (loader dep).
  from: z.string().date().optional().catch(undefined),
  to: z.string().date().optional().catch(undefined),
});

// Reuse `paginationSchema` (strict-RPC variant — required `number`s for the
// server fn). `username` plus the P30 server-driven filters (`tags` / `sort`)
// need a route-local schema. `display` is a client-only concern and never
// reaches the server fn.
const renderInputSchema = z
  .object({
    username: z.string().min(1).max(64),
    tags: z.array(z.string().min(1).max(64)).max(8).optional(),
    sort: z.enum(PUBLIC_SORTS).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .extend(paginationSchema.shape);

const renderUserPublicTop = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renderInputSchema))
  .handler(async ({ data }) => {
    const { UserPublicTop } = await import("@/components/public/UserPublicTop");
    return renderServerComponent(
      <UserPublicTop
        username={data.username}
        page={data.page}
        limit={data.limit}
        tags={data.tags}
        sort={data.sort}
        from={data.from}
        to={data.to}
      />,
    );
  });

// Head-only profile metadata (loader two-stage; see ADR-003). Returns
// `null` for missing / unavailable users so `head` falls back to defaults.
const loadProfileMeta = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(z.object({ username: z.string().min(1).max(64) })),
  )
  .handler(async ({ data }) => {
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const { isNotFoundError } = await import("@/core/application/errors");
    const { getPublicProfile } = await import(
      "@/core/application/publication/getPublicProfile"
    );
    const container = await getContainer();
    try {
      const { user } = await getPublicProfile({
        container,
        input: { username: data.username },
      });
      return {
        displayName: user.displayName,
        username: user.username,
        bio: user.bio,
      };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  });

export const Route = createFileRoute("/u/$username/")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  gcTime: PUBLIC_ROUTE_GC_TIME,
  validateSearch: (search) => publicTopSearchSchema.parse(search),
  // `display` is excluded so its client-only swap does not re-run the
  // loader (ADR-004); `tags` / `sort` drive server re-fetch.
  loaderDeps: ({ search }) => ({
    page: search.page,
    limit: search.limit,
    tags: search.tags,
    sort: search.sort,
    from: search.from,
    to: search.to,
  }),
  loader: ({ params, deps }) =>
    renderUserPublicTop({
      data: {
        username: params.username,
        page: deps.page ?? PAGINATION_DEFAULT_PAGE,
        limit: deps.limit ?? PAGINATION_DEFAULT_LIMIT,
        ...(deps.tags !== undefined ? { tags: deps.tags } : {}),
        ...(deps.sort !== undefined ? { sort: deps.sort } : {}),
        ...(deps.from !== undefined ? { from: deps.from } : {}),
        ...(deps.to !== undefined ? { to: deps.to } : {}),
      },
    }),
  head: async ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    const path = `/u/${params.username}`;
    const meta = await loadProfileMeta({
      data: { username: params.username },
    }).catch(() => null);
    const title =
      meta !== null
        ? `${meta.displayName} (@${meta.username}) — ${config.siteName}`
        : `@${params.username} — ${config.siteName}`;
    const head = buildHead(config, {
      title,
      ...(meta?.bio ? { description: meta.bio } : {}),
      path,
    });
    if (meta === null) return head;
    const url = joinUrl(config.appUrl, path);
    const profile = buildJsonLdScript({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url,
      mainEntity: {
        "@type": "Person",
        name: meta.displayName,
        alternateName: meta.username,
        url,
        ...(meta.bio ? { description: meta.bio } : {}),
      },
    });
    return { ...head, scripts: [profile] };
  },
  component: UserPublicTopPage,
  notFoundComponent: () => <ErrorPage kind="notFound" />,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function UserPublicTopPage() {
  const Rendered = Route.useLoaderData();
  return <>{Rendered}</>;
}
