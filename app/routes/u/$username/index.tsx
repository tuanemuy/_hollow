import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { ErrorPage } from "@/components/public/ErrorPage";
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

// Issue #215: reuse `paginationSearchSchema` (URL variant — `page` /
// `limit` are input/output optional so omission keeps the URL clean)
// and `paginationSchema` (strict-RPC variant — required `number`s for
// the server fn) instead of redefining their pagination caps inline.
// `username` is the only field that needs a route-local schema.
const renderInputSchema = z
  .object({ username: z.string().min(1).max(64) })
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
  staleTime: 0,
  validateSearch: (search) => paginationSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    renderUserPublicTop({
      data: {
        username: params.username,
        page: deps.page ?? PAGINATION_DEFAULT_PAGE,
        limit: deps.limit ?? PAGINATION_DEFAULT_LIMIT,
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
