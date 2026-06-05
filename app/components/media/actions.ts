import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { finalizeMediaSchema, presignMediaUploadSchema } from "./schema";

/**
 * Mint a short-lived presigned R2 upload URL together with a freshly
 * created `MediaAsset` row in `pending` state. The client PUTs the
 * file directly to `uploadUrl` and follows up with `finalizeMediaUploadFn`.
 *
 * The returned URL is stringified because `URL` instances do not survive
 * TanStack Start's transport serialisation cleanly.
 */
export const presignMediaUploadFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(presignMediaUploadSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/media/uploadMediaPresigned"),
    );
    const result = await module.uploadMediaPresigned({
      container,
      input: {
        actorUserId: user.id,
        kind: data.kind,
        mimeType: data.mimeType,
        byteSize: data.byteSize,
      },
    });
    return {
      mediaId: result.mediaId,
      uploadUrl: result.uploadUrl.toString(),
      expectedDownloadUrl: result.expectedDownloadUrl.toString(),
    };
  });

/**
 * Reconcile a presigned upload by reading the R2 head metadata and
 * updating the persisted `MediaAsset` row's byte size + mime type.
 *
 * Returns the canonical `/media/<id>` reference path so the caller can
 * insert it into the note HTML without re-computing.
 */
export const finalizeMediaUploadFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(finalizeMediaSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/media/finalizeUpload"),
    );
    const result = await module.finalizeUpload({
      container,
      input: {
        actorUserId: user.id,
        mediaId: data.mediaId,
      },
    });
    return {
      mediaId: result.mediaId,
      byteSize: result.byteSize,
      mimeType: result.mimeType,
      url: `/media/${result.mediaId}`,
    };
  });
