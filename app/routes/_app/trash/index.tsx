import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { HOME_SEARCH } from "@/components/auth/links";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
  paginationSchema,
  paginationSearchSchema,
} from "@/core/presentation/pagination";
import { validateInput } from "@/core/presentation/validator";

const renderTrash = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(paginationSchema))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { TrashList } = await import("@/components/trash/TrashList");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <TrashList user={userDto} page={data.page} limit={data.limit} />,
    );
  });

export const Route = createFileRoute("/_app/trash/")({
  staleTime: 0,
  validateSearch: (search) => paginationSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `ゴミ箱 — ${config.siteName}`,
      path: "/trash",
      noIndex: true,
    });
  },
  // Issue #215: `paginationSearchSchema` now leaves `page` / `limit`
  // optional on its output, so fall back to the defaults here before
  // calling the strict-typed server fn.
  loader: ({ deps }) =>
    renderTrash({
      data: {
        page: deps.page ?? PAGINATION_DEFAULT_PAGE,
        limit: deps.limit ?? PAGINATION_DEFAULT_LIMIT,
      },
    }),
  component: TrashRoute,
  errorComponent: RouteErrorFallback,
});

function TrashRoute() {
  return Route.useLoaderData();
}
