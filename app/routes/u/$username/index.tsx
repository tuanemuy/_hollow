import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { ErrorPage } from "@/components/public/ErrorPage";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
} from "@/core/presentation/pagination";
import { validateInput } from "@/core/presentation/validator";

// Issue #215: `page` / `limit` are fully optional (input and output) so
// `<Link to="/u/$username">` without an explicit `search` does not
// serialise the schema defaults into the URL. The loader supplies
// `1` / `20` fallbacks before calling the server fn.
const searchSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
});

const renderInputSchema = z.object({
  username: z.string().min(1).max(64),
  page: z.number().int().min(1).max(10_000),
  limit: z.number().int().min(1).max(100),
});

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

export const Route = createFileRoute("/u/$username/")({
  staleTime: 0,
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    renderUserPublicTop({
      data: {
        username: params.username,
        page: deps.page ?? PAGINATION_DEFAULT_PAGE,
        limit: deps.limit ?? PAGINATION_DEFAULT_LIMIT,
      },
    }),
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `@${params.username} — ${config.siteName}`,
      path: `/u/${params.username}`,
    });
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
