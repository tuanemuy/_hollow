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
  DEFAULT_OG_IMAGE_PATH,
  joinUrl,
} from "@/core/presentation/head";
import { loadPublicNoteMeta } from "@/core/presentation/publicNoteMeta";
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

// Head-only metadata fetch (loader two-stage; see ADR-003).
const loadNoteMeta = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renderInputSchema))
  .handler(async ({ data }) => {
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const container = await getContainer();
    return loadPublicNoteMeta(container, {
      kind: "byId",
      noteId: data.noteId,
    });
  });

export const Route = createFileRoute("/notes/public/$noteId")({
  staleTime: 10_000,
  loader: ({ params }) =>
    renderPublicNoteById({ data: { noteId: params.noteId } }),
  head: async ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    const path = `/notes/public/${params.noteId}`;
    const meta = await loadNoteMeta({
      data: { noteId: params.noteId },
    }).catch(() => null);
    if (meta === null) {
      return buildHead(config, {
        title: `公開ノート — ${config.siteName}`,
        path,
        ogType: "article",
      });
    }
    const { meta: metaTags, links } = buildHead(config, {
      title: `${meta.title} — ${config.siteName}`,
      ...(meta.description ? { description: meta.description } : {}),
      path,
      ogType: "article",
      ...(meta.publishedTime !== undefined
        ? { publishedTime: meta.publishedTime }
        : {}),
      modifiedTime: meta.modifiedTime,
      authorName: meta.authorName,
      tags: meta.tags,
    });
    const url = joinUrl(config.appUrl, path);
    const article = buildJsonLdScript({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: meta.title,
      ...(meta.description ? { description: meta.description } : {}),
      image: joinUrl(config.appUrl, DEFAULT_OG_IMAGE_PATH),
      ...(meta.publishedTime !== undefined
        ? { datePublished: meta.publishedTime }
        : {}),
      dateModified: meta.modifiedTime,
      author: { "@type": "Person", name: meta.authorName },
      // `article:tag` meta collapses to one entry (TanStack dedups meta by
      // `property`), so carry the full tag set here where it does not.
      ...(meta.tags.length > 0 ? { keywords: meta.tags } : {}),
      mainEntityOfPage: url,
    });
    return { meta: metaTags, links, scripts: [article] };
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
