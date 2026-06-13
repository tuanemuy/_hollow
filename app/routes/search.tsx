import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { ErrorPage } from "@/components/public/ErrorPage";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

// P32 drawer filters. `tags` AND-filters the public search by tag
// name; `period` narrows by a rolling date window (radio facet). Both are
// confirmed values carried in the URL (the combobox *suggestions* are
// fetched per-keystroke via a server fn and never persisted to the URL).
// `.catch(...)` keeps hand-typed junk from erroring the route; omission
// keeps the URL clean.
const SEARCH_PERIODS = ["7d", "30d", "1y", "all"] as const;
// Sort axis for the result list. Omission means relevance order (the
// default), so the URL stays clean until the user opts into `newest`.
const SEARCH_SORTS = ["relevance", "newest"] as const;

const searchSchema = z.object({
  q: z.string().max(200).catch(""),
  username: z.string().min(1).max(64).optional(),
  tags: z.array(z.string().min(1).max(64)).max(8).optional().catch(undefined),
  period: z.enum(SEARCH_PERIODS).optional().catch(undefined),
  sort: z.enum(SEARCH_SORTS).optional().catch(undefined),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(50).catch(20),
});

const renderInputSchema = z.object({
  q: z.string().max(200),
  username: z.string().min(1).max(64).optional(),
  tags: z.array(z.string().min(1).max(64)).max(8).optional(),
  period: z.enum(SEARCH_PERIODS).optional(),
  sort: z.enum(SEARCH_SORTS).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.number().int().min(1).max(50),
});

const renderPublicSearch = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renderInputSchema))
  .handler(async ({ data }) => {
    const { PublicSearch } = await import("@/components/public/PublicSearch");
    return renderServerComponent(
      <PublicSearch
        keyword={data.q}
        username={data.username ?? null}
        tags={data.tags ?? null}
        period={data.period ?? null}
        sort={data.sort ?? null}
        cursor={data.cursor ?? null}
        limit={data.limit}
      />,
    );
  });

export const Route = createFileRoute("/search")({
  staleTime: 0,
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    renderPublicSearch({
      data: {
        q: deps.q,
        ...(deps.username !== undefined ? { username: deps.username } : {}),
        ...(deps.tags !== undefined ? { tags: deps.tags } : {}),
        ...(deps.period !== undefined ? { period: deps.period } : {}),
        ...(deps.sort !== undefined ? { sort: deps.sort } : {}),
        ...(deps.cursor !== undefined ? { cursor: deps.cursor } : {}),
        limit: deps.limit,
      },
    }),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `検索 — ${config.siteName}`,
      path: "/search",
    });
  },
  component: PublicSearchPage,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function PublicSearchPage() {
  const Rendered = Route.useLoaderData();
  return <>{Rendered}</>;
}
