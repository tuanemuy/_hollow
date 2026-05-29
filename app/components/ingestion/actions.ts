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
  ownerRetryIngestionJobSchema,
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
    const promptOverride = readPromptOverride(data);
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
        ...(promptOverride === undefined ? {} : { promptOverride }),
      },
    });
    return { jobId: result.jobId as unknown as string };
  });

// Transport-boundary cap, byte-for-byte aligned with the `PromptOverride`
// VO (16 KiB). Guards against pathologically large textarea payloads
// before the bytes reach the usecase / VO construction.
const PROMPT_OVERRIDE_MAX_BYTES = 16 * 1024;

// Reads the optional `structurePrompt` / `metadataPrompt` form fields.
// Only non-empty strings (after trim) become overrides; `File` values and
// blanks are ignored. Over-cap values are rejected here (DoS guard) so the
// huge body never reaches the usecase.
function readPromptOverride(
  data: FormData,
): { structure?: string; metadata?: string } | undefined {
  const pick = (field: string): string | undefined => {
    const value = data.get(field);
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (new TextEncoder().encode(trimmed).length > PROMPT_OVERRIDE_MAX_BYTES) {
      throw new Error(`${field} exceeds maximum size`);
    }
    return trimmed;
  };
  const structure = pick("structurePrompt");
  const metadata = pick("metadataPrompt");
  if (structure === undefined && metadata === undefined) return undefined;
  return {
    ...(structure === undefined ? {} : { structure }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

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
        // Polling honours the upload page's "show discarded" toggle so a
        // tick never strips discarded jobs the user opted to see. Omitted
        // means OFF — the usecase keeps the default-hidden contract.
        includeDiscarded: z.boolean().optional(),
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
        ...(data.includeDiscarded === true ? { includeDiscarded: true } : {}),
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

export const ownerRetryIngestionJobFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(ownerRetryIngestionJobSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/ownerRetryIngestionJob"),
    );
    const result = await module.ownerRetryIngestionJob({
      container,
      input: {
        actorUserId: toDtoUserId(user.id),
        jobId: data.jobId as unknown as Parameters<
          typeof module.ownerRetryIngestionJob
        >[0]["input"]["jobId"],
      },
    });
    return { jobId: result.jobId as unknown as string };
  });
