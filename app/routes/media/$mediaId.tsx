import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";

/**
 * Resolve `/media/<id>` to a short-lived R2 presigned download URL via
 * a 302 redirect.
 *
 * The `<img src="/media/<id>">` form is what `MEDIA_ID_FROM_URL`
 * (in `core/domain/note/service.ts`) recognises when computing
 * `MediaService.reconcileRefs`. Inserting R2 direct URLs into note
 * bodies would silently break refCount accounting and lead to
 * `PurgeOrphans` deletions of in-use assets — see ADR-009 for
 * background.
 */
const resolveMediaRedirect = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(
      z.object({
        mediaId: z.string().min(1),
        download: z.boolean().optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const viewer = await getCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/media/downloadMedia"),
    );
    const result = await module.downloadMedia({
      container,
      input: {
        viewerUserId: viewer === null ? null : viewer.id,
        mediaId: data.mediaId as MediaAssetId,
        viaShareLinkId: null,
        relatedNoteId: null,
        download: data.download === true,
      },
    });
    throw redirect({ href: result.redirectUrl.toString(), statusCode: 302 });
  });

const mediaSearchSchema = z.object({
  // `?download=1` requests an attachment (named save) instead of inline
  // preview. TanStack Router's default search parser JSON-parses values,
  // so a bare `?download=1` arrives as the number `1` (not the string
  // "1"); accept the boolean, string, and number forms so the
  // `<a href="/media/<id>?download=1">` form works regardless of parsing.
  download: z
    .union([
      z.boolean(),
      z.literal("1"),
      z.literal("0"),
      z.literal(1),
      z.literal(0),
    ])
    .optional()
    .transform((v) => v === true || v === "1" || v === 1),
});

// Exported for regression testing: the `?download` flag must survive
// TanStack Router's JSON-parsing search reader, which turns a bare
// `?download=1` into the number `1` (see schema note above).
export const validateMediaSearch = (search: Record<string, unknown>) =>
  mediaSearchSchema.parse(search);

export const Route = createFileRoute("/media/$mediaId")({
  validateSearch: validateMediaSearch,
  loaderDeps: ({ search }) => ({ download: search.download }),
  loader: ({ params, deps }) =>
    resolveMediaRedirect({
      data: { mediaId: params.mediaId, download: deps.download },
    }),
  component: MediaRedirectPlaceholder,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>メディアを取得できません</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

// Loader always throws a redirect on success, so this component is only
// reachable while the redirect is in flight (or when the user navigated
// here client-side and the loader is being awaited).
function MediaRedirectPlaceholder() {
  return null;
}
