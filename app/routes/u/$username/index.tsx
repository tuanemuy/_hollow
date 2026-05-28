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
