import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { ErrorPage } from "@/components/public/ErrorPage";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const searchSchema = z.object({
  q: z.string().max(200).catch(""),
  username: z.string().min(1).max(64).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(50).catch(20),
});

const renderInputSchema = z.object({
  q: z.string().max(200),
  username: z.string().min(1).max(64).optional(),
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
