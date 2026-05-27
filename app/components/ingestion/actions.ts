import { createServerFn } from "@tanstack/react-start";
import type { UserId as UserIdDTO } from "@/core/application/dto/identity";
import type { IngestionJobDTO } from "@/core/application/dto/ingestion";
import type { InternalLinkRefDTO } from "@/core/application/dto/note";
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

/**
 * Transport-safe projection of `IngestionJobDTO` for client polling.
 *
 * `FrontMatterDTO` (`Record<string, unknown>`) cannot cross the
 * TanStack Start serialization boundary by type — its index signature
 * resolves to `unknown` which the framework rejects as "may not be
 * serializable". We therefore stringify the preview's FrontMatter into
 * `frontMatterJson` here and rehydrate it in `IngestionPreviewForm`.
 * This mirrors the note-side ADR-008 convention.
 */
export type IngestionPreviewWire = Readonly<{
  title: string;
  contentHtml: string;
  suggestedDirectoryId: string | null;
  suggestedDirectoryName: string | null;
  frontMatterJson: string;
  suggestedTagNames: readonly string[];
  internalLinkRefs: readonly InternalLinkRefDTO[];
  mediaRefs: readonly string[];
}>;

export type IngestionJobWire = Readonly<{
  id: string;
  ownerId: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  kind: string;
  status: IngestionJobDTO["status"];
  preview: IngestionPreviewWire | null;
  errorCode: string | null;
  errorReason: string | null;
  regenerationCount: number;
  savedAsNoteId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

function toIngestionJobWire(job: IngestionJobDTO): IngestionJobWire {
  return {
    id: job.id as unknown as string,
    ownerId: job.ownerId as unknown as string,
    originalFileName: job.originalFileName,
    mimeType: job.mimeType,
    byteSize: job.byteSize,
    kind: job.kind,
    status: job.status,
    preview:
      job.preview === null
        ? null
        : {
            title: job.preview.title,
            contentHtml: job.preview.contentHtml,
            suggestedDirectoryId:
              job.preview.suggestedDirectoryId === null
                ? null
                : (job.preview.suggestedDirectoryId as unknown as string),
            suggestedDirectoryName: job.preview.suggestedDirectoryName,
            frontMatterJson: JSON.stringify(job.preview.frontMatter),
            suggestedTagNames: job.preview.suggestedTagNames,
            internalLinkRefs: job.preview.internalLinkRefs,
            mediaRefs: job.preview.mediaRefs.map(
              (id) => id as unknown as string,
            ),
          },
    errorCode: job.errorCode,
    errorReason: job.errorReason,
    regenerationCount: job.regenerationCount,
    savedAsNoteId:
      job.savedAsNoteId === null
        ? null
        : (job.savedAsNoteId as unknown as string),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

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
