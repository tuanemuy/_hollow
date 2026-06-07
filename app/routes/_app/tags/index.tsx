import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { HOME_SEARCH } from "@/components/auth/links";
import {
  tagListParamsSchema,
  tagListSearchSchema,
} from "@/components/tag/schema";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderTags = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(tagListParamsSchema))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { TagManager } = await import("@/components/tag/TagManager");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <TagManager
        user={userDto}
        q={data.q}
        sort={data.sort}
        order={data.order}
      />,
    );
  });

export const Route = createFileRoute("/_app/tags/")({
  staleTime: 0,
  validateSearch: (search) => tagListSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `タグ — ${config.siteName}`,
      path: "/tags",
      noIndex: true,
    });
  },
  // The URL schema leaves `sort` / `order` optional; re-default here (in
  // step with `trash/index.tsx`'s `?? PAGINATION_DEFAULT_*`) to the
  // backend defaults so the toolbar's active state stays consistent. `q`
  // stays `undefined` when unspecified (no search applied).
  loader: ({ deps }) =>
    renderTags({
      data: {
        q: deps.q,
        sort: deps.sort ?? "name",
        order: deps.order ?? "asc",
      },
    }),
  component: TagsRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function TagsRoute() {
  return Route.useLoaderData();
}
