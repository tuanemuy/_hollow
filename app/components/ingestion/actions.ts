import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { UserId as UserIdDTO } from "@/core/application/dto/identity";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { parseFrontMatterJson } from "../note/actions";
import {
  commitIngestionPreviewSchema,
  discardIngestionPreviewSchema,
  getIngestionJobSchema,
  regenerateIngestionPreviewSchema,
} from "./schema";
import {
  type IngestionJobWire,
  type IngestionPreviewWire,
  toIngestionJobWire,
} from "./wire";

export type { IngestionJobWire, IngestionPreviewWire };

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
    // `parseFrontMatterJson` throws `BusinessRuleError("FRONT_MATTER_JSON_INVALID")`
    // for malformed JSON / non-object shapes — see note-side ADR-008.
    const frontMatter = parseFrontMatterJson(data.frontMatterJson);
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
          ...(frontMatter === undefined ? {} : { frontMatter }),
        },
      },
    });
    return { noteId: result.noteId as unknown as string };
  });

export const getIngestionJobFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(getIngestionJobSchema))
  .handler(async ({ data }): Promise<{ job: IngestionJobWire }> => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/getIngestionJob"),
    );
    const result = await module.getIngestionJob({
      container,
      input: {
        actorUserId: toDtoUserId(user.id),
        jobId: data.jobId as unknown as Parameters<
          typeof module.getIngestionJob
        >[0]["input"]["jobId"],
      },
    });
    return { job: toIngestionJobWire(result.job) };
  });

export const getIngestionJobsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(
      z.object({
        limit: z.number().int().positive().max(200).optional(),
      }),
    ),
  )
  .handler(async ({ data }): Promise<{ jobs: readonly IngestionJobWire[] }> => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/getIngestionJobs"),
    );
    const result = await module.getIngestionJobs({
      container,
      input: {
        actorUserId: toDtoUserId(user.id),
        limit: data.limit ?? 50,
      },
    });
    return { jobs: result.jobs.map(toIngestionJobWire) };
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
