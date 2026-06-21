import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { ErrorPage } from "@/components/public/ErrorPage";
import { PUBLIC_ROUTE_GC_TIME } from "@/components/public/routeCache";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import {
  buildHead,
  buildJsonLdScript,
  DEFAULT_OG_IMAGE_PATH,
  joinUrl,
} from "@/core/presentation/head";
import { loadPublicNoteMeta } from "@/core/presentation/publicNoteMeta";
import { ensurePublicResourceExists } from "@/core/presentation/publicStatusBridge";
import { validateInput } from "@/core/presentation/validator";

const renderInputSchema = z.object({
  username: z.string().min(1).max(64),
  noteSlug: z.string().min(1).max(160),
});

const renderPublicNote = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renderInputSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { getPublicNote }, { PublicNoteDetail }] =
      await Promise.all([
        import("@/core/application/di/containerStore"),
        import("@/core/application/publication/getPublicNote"),
        import("@/components/public/PublicNoteDetail"),
      ]);
    // Resolve existence here so a missing/private note becomes a 404 document
    // (RSC-internal notFound can't set the status). See publicStatusBridge.
    await ensurePublicResourceExists(async () => {
      const container = await getContainer();
      return getPublicNote({
        container,
        input: { kind: "bySlug", username: data.username, slug: data.noteSlug },
      });
    });
    return renderServerComponent(
      <PublicNoteDetail
        args={{ kind: "bySlug", username: data.username, slug: data.noteSlug }}
      />,
    );
  });

// Lightweight head-only metadata fetch (loader two-stage; see ADR-003).
// The RSC `loader` above returns an opaque element, so `head` cannot read
// note fields from `loaderData` — it calls this instead.
const loadNoteMeta = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renderInputSchema))
  .handler(async ({ data }) => {
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const container = await getContainer();
    return loadPublicNoteMeta(container, {
      kind: "bySlug",
      username: data.username,
      slug: data.noteSlug,
    });
  });

export const Route = createFileRoute("/u/$username/$noteSlug")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  gcTime: PUBLIC_ROUTE_GC_TIME,
  loader: ({ params }) =>
    renderPublicNote({
      data: { username: params.username, noteSlug: params.noteSlug },
    }),
  head: async ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    const path = `/u/${params.username}/${params.noteSlug}`;
    const meta = await loadNoteMeta({
      data: { username: params.username, noteSlug: params.noteSlug },
    }).catch(() => null);
    if (meta === null) {
      return buildHead(config, {
        title: `@${params.username} — ${config.siteName}`,
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
  component: PublicNotePage,
  // HTTP 404 (router-fixed) but a `gone` screen on purpose: the document
  // status can only be 404, while the screen keeps #599's gone wording for
  // missing/private notes. See publicStatusBridge / .issue/735 ADR-004.
  notFoundComponent: () => <ErrorPage kind="gone" />,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
});

function PublicNotePage() {
  const Rendered = Route.useLoaderData();
  return <>{Rendered}</>;
}
