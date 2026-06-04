import { createServerFn } from "@tanstack/react-start";
import type { NoteId } from "@/core/domain/note/valueObject";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import {
  cancelExportSchema,
  downloadExportSchema,
  enqueueExportSchema,
  startExportSchema,
} from "../schema";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i] ?? 0);
  }
  // btoa is available in Cloudflare Workers / browser global; on Node
  // 18+ it is also exposed as a global.
  return btoa(bin);
}

/**
 * Synchronous single-note export. The usecase returns the artifact
 * bytes inline; we encode to base64 so the value survives the seroval
 * roundtrip and the client decodes into a Blob to trigger a download.
 */
export const startExportFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(startExportSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/export/startExportJob"),
    );
    const { artifact } = await module.startExportJob({
      container,
      input: {
        actorUserId: actor.id,
        format: data.format,
        targetNoteId: data.noteId as NoteId,
        options: data.options,
      },
    });
    return {
      fileName: artifact.fileName,
      mimeType: artifact.mimeType,
      base64: arrayBufferToBase64(artifact.bytes),
    };
  });

export const enqueueExportFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(enqueueExportSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/export/enqueueExportJob"),
    );
    return module.enqueueExportJob({
      container,
      input: {
        actorUserId: actor.id,
        format: data.format,
        scope: data.scope,
        noteIds: data.noteIds.map((id) => id as NoteId),
        options: data.options,
      },
    });
  });

export const cancelExportFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(cancelExportSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/export/cancelExportJob"),
    );
    return module.cancelExportJob({
      container,
      input: {
        actorUserId: actor.id,
        jobId: data.jobId,
      },
    });
  });

export const downloadExportFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(downloadExportSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/export/downloadExportArtifact"),
    );
    const { url, expiresAt } = await module.downloadExportArtifact({
      container,
      input: {
        actorUserId: actor.id,
        jobId: data.jobId,
      },
    });
    return { url: url.toString(), expiresAt: expiresAt.toISOString() };
  });
