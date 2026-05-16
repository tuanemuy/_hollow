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
  noteId: z.string().min(1).max(64),
});

const renderPublicNoteById = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renderInputSchema))
  .handler(async ({ data }) => {
    const { PublicNoteDetail } = await import(
      "@/components/public/PublicNoteDetail"
    );
    return renderServerComponent(
      <PublicNoteDetail args={{ kind: "byId", noteId: data.noteId }} />,
    );
  });

export const Route = createFileRoute("/notes/public/$noteId")({
  staleTime: 10_000,
  loader: ({ params }) =>
    renderPublicNoteById({ data: { noteId: params.noteId } }),
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `公開ノート — ${config.siteName}`,
      path: `/notes/public/${params.noteId}`,
      ogType: "article",
    });
  },
  component: PublicNoteByIdPage,
  notFoundComponent: () => <ErrorPage kind="gone" />,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function PublicNoteByIdPage() {
  const Rendered = Route.useLoaderData();
  return <>{Rendered}</>;
}
