import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { ErrorPage } from "@/components/public/ErrorPage";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderInputSchema = z.object({
  username: z.string().min(1).max(64),
  noteSlug: z.string().min(1).max(160),
});

const renderPublicNote = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renderInputSchema))
  .handler(async ({ data }) => {
    const { PublicNoteDetail } = await import(
      "@/components/public/PublicNoteDetail"
    );
    return renderServerComponent(
      <PublicNoteDetail
        args={{ kind: "bySlug", username: data.username, slug: data.noteSlug }}
      />,
    );
  });

export const Route = createFileRoute("/u/$username/$noteSlug")({
  staleTime: 10_000,
  loader: ({ params }) =>
    renderPublicNote({
      data: { username: params.username, noteSlug: params.noteSlug },
    }),
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `${params.noteSlug} — @${params.username}`,
      path: `/u/${params.username}/${params.noteSlug}`,
      ogType: "article",
    });
  },
  component: PublicNotePage,
  notFoundComponent: () => <ErrorPage kind="gone" />,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function PublicNotePage() {
  const Rendered = Route.useLoaderData();
  return <>{Rendered}</>;
}
