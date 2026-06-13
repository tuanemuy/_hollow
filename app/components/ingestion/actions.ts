import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppServerError } from "@/core/presentation/errorResponse";
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
        actorUserId: user.id,
        originalFileName: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
        bodyStream: file.stream(),
        ...(promptOverride === undefined ? {} : { promptOverride }),
      },
    });
    return { jobId: result.jobId };
  });

// Transport-boundary cap, byte-for-byte aligned with the `PromptOverride`
// VO (16 KiB). Guards against pathologically large textarea payloads
// before the bytes reach the usecase / VO construction.
export const PROMPT_OVERRIDE_MAX_BYTES = 16 * 1024;

// Reads the optional `structurePrompt` / `metadataPrompt` form fields.
// Only non-empty strings (after trim) become overrides; `File` values and
// blanks are ignored. Over-cap values are rejected here (DoS guard) so the
// huge body never reaches the usecase.
export function readPromptOverride(
  data: FormData,
): { structure?: string; metadata?: string } | undefined {
  const pick = (field: string): string | undefined => {
    const value = data.get(field);
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (new TextEncoder().encode(trimmed).length > PROMPT_OVERRIDE_MAX_BYTES) {
      // Transport-boundary cap breach is a shape/DoS violation, surfaced as
      // a `validation` kind so the UI shows the field message (422) rather
      // than the generic "エラーが発生しました".
      throw new AppServerError({
        kind: "validation",
        code: "INVALID_INPUT",
        message: "カスタムプロンプトが長すぎます（上限 16 KiB）",
        retryable: false,
        fieldErrors: {
          [field]: ["カスタムプロンプトは 16 KiB 以内で入力してください"],
        },
      });
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
    // for malformed JSON / non-object shapes.
    const frontMatter = parseFrontMatterJson(data.frontMatterJson);
    const result = await module.commitIngestionPreview({
      container,
      input: {
        actorUserId: user.id,
        jobId: data.jobId,
        modifications: {
          ...(data.title === undefined ? {} : { title: data.title }),
          ...(data.directoryId === undefined
            ? {}
            : { directoryId: data.directoryId }),
          ...(data.directoryNameToCreate === undefined
            ? {}
            : { directoryNameToCreate: data.directoryNameToCreate }),
          ...(data.tagNames === undefined ? {} : { tagNames: data.tagNames }),
          ...(frontMatter === undefined ? {} : { frontMatter }),
        },
      },
    });
    return { noteId: result.noteId };
  });

export type EffectiveIngestionPromptsWire = {
  structure: { text: string; isUserOverride: boolean };
  metadata: { text: string; isUserOverride: boolean };
};

// Read-only GET, no transport input: the actor is resolved server-side
// from `requireCurrentUser`. Mirrors `getDirectoryTreeFn` (note/actions),
// the established input-less GET server-fn, so `inputValidator` is
// intentionally omitted.
export const getEffectiveIngestionPromptsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<EffectiveIngestionPromptsWire> => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/getEffectiveIngestionPrompts"),
    );
    const result = await module.getEffectiveIngestionPrompts({
      container,
      input: { actorUserId: user.id },
    });
    return {
      structure: {
        text: result.structure.text,
        isUserOverride: result.structure.isUserOverride,
      },
      metadata: {
        text: result.metadata.text,
        isUserOverride: result.metadata.isUserOverride,
      },
    };
  });

// Read-only GET, no transport input (same input-less GET pattern as
// `getEffectiveIngestionPromptsFn`). Feeds the header queue badge.
export const getIngestionQueueCountFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<{ count: number }> => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/countActiveIngestionJobs"),
    );
    const result = await module.countActiveIngestionJobs({
      container,
      input: { actorUserId: user.id },
    });
    return { count: result.count };
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
        actorUserId: user.id,
        jobId: data.jobId,
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
        actorUserId: user.id,
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
        actorUserId: user.id,
        jobId: data.jobId,
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
        actorUserId: user.id,
        jobId: data.jobId,
      },
    });
    return { jobId: result.jobId };
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
        actorUserId: user.id,
        jobId: data.jobId,
      },
    });
    return { jobId: result.jobId };
  });
