import { createServerFn } from "@tanstack/react-start";
import type { UserId as UserIdDTO } from "@/core/application/dto/identity";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import {
  commitIngestionPreviewSchema,
  discardIngestionPreviewSchema,
  regenerateIngestionPreviewSchema,
} from "./schema";

const toDtoUserId = (
  id: import("@/core/domain/identity/valueObject").UserId,
): UserIdDTO => id as unknown as UserIdDTO;

export const uploadFileFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator((formData: unknown): FormData => {
    if (!(formData instanceof FormData)) {
      throw new Error("Expected multipart/form-data payload");
    }
    return formData;
  })
  .handler(async ({ data }) => {
    const file = data.get("file");
    if (!(file instanceof File)) {
      throw new Error("file field is required");
    }
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/uploadFile"),
    );
    const result = await module.uploadFile({
      container,
      input: {
        actorUserId: toDtoUserId(user.id),
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        bodyStream: file.stream(),
      },
    });
    return { jobId: result.jobId as unknown as string };
  });

export const commitIngestionPreviewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(commitIngestionPreviewSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/commitIngestionPreview"),
    );
    const result = await module.commitIngestionPreview({
      container,
      input: {
        actorUserId: toDtoUserId(user.id),
        jobId: data.jobId as unknown as Parameters<
          typeof module.commitIngestionPreview
        >[0]["input"]["jobId"],
        modifications: {
          ...(data.title === undefined ? {} : { title: data.title }),
          ...(data.directoryId === undefined
            ? {}
            : {
                directoryId: data.directoryId as unknown as NonNullable<
                  Parameters<
                    typeof module.commitIngestionPreview
                  >[0]["input"]["modifications"]["directoryId"]
                >,
              }),
          ...(data.directoryNameToCreate === undefined
            ? {}
            : { directoryNameToCreate: data.directoryNameToCreate }),
          ...(data.tagNames === undefined ? {} : { tagNames: data.tagNames }),
        },
      },
    });
    return { noteId: result.noteId as unknown as string };
  });

export const discardIngestionPreviewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(discardIngestionPreviewSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/discardIngestionPreview"),
    );
    await module.discardIngestionPreview({
      container,
      input: {
        actorUserId: toDtoUserId(user.id),
        jobId: data.jobId as unknown as Parameters<
          typeof module.discardIngestionPreview
        >[0]["input"]["jobId"],
      },
    });
    return { ok: true as const };
  });

export const regenerateIngestionPreviewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(regenerateIngestionPreviewSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/regenerateIngestionPreview"),
    );
    const result = await module.regenerateIngestionPreview({
      container,
      input: {
        actorUserId: toDtoUserId(user.id),
        jobId: data.jobId as unknown as Parameters<
          typeof module.regenerateIngestionPreview
        >[0]["input"]["jobId"],
      },
    });
    return { jobId: result.jobId as unknown as string };
  });
