import { describe, expect, it, vi } from "vitest";
import type { RequestContainer } from "@/core/application/di/types";
import type {
  PromptPreviewRateLimiter,
  RateLimitDecision,
} from "@/core/application/ports/promptPreviewRateLimiter";
import { BusinessRuleError, isBusinessRuleError } from "@/core/domain/error";
import type { UserId as IdentityUserId } from "@/core/domain/identity/valueObject";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  type LLMMetadataInput,
  type LLMMetadataResult,
  type LLMProvider,
  LLMQuotaExceededError,
  LLMRateLimitError,
  type LLMStructureInput,
  type LLMStructureResult,
  LLMTimeoutError,
  LLMUnavailableError,
} from "@/core/domain/ingestion/ports/llmProvider";
import type {
  IngestionPromptPurpose,
  PromptResolver,
} from "@/core/domain/ingestion/ports/promptResolver";
import { previewPrompt } from "../previewPrompt";

const ACTOR = "00000000-0000-7000-9000-000000000001";

type LLMStubs = {
  structure?: LLMStructureResult | (() => Promise<LLMStructureResult>);
  metadata?: LLMMetadataResult | (() => Promise<LLMMetadataResult>);
};

function makeContainer(opts: {
  resolved?: Partial<Record<IngestionPromptPurpose, string>>;
  llm?: LLMStubs;
  allowed?: boolean;
}): {
  container: RequestContainer;
  resolveFor: ReturnType<typeof vi.fn>;
  structureToHtml: ReturnType<typeof vi.fn>;
  suggestMetadata: ReturnType<typeof vi.fn>;
  tryConsume: ReturnType<typeof vi.fn>;
} {
  const resolveFor = vi.fn(
    async (_userId: IdentityUserId, purpose: IngestionPromptPurpose) =>
      opts.resolved?.[purpose] ?? "",
  );
  const promptResolver: PromptResolver = { resolveFor };

  const structureToHtml = vi.fn(
    async (_input: LLMStructureInput): Promise<LLMStructureResult> => {
      const s = opts.llm?.structure;
      if (typeof s === "function") return s();
      return (
        s ?? {
          html: "<p>structured</p>",
          titleSuggestion: "A Title",
          directorySuggestion: "Proposed/Dir",
        }
      );
    },
  );
  const suggestMetadata = vi.fn(
    async (_input: LLMMetadataInput): Promise<LLMMetadataResult> => {
      const m = opts.llm?.metadata;
      if (typeof m === "function") return m();
      return m ?? { tags: ["alpha"], aliases: ["beta"] };
    },
  );
  const llmProvider: LLMProvider = { structureToHtml, suggestMetadata };

  const tryConsume = vi.fn(
    async (): Promise<RateLimitDecision> => ({
      allowed: opts.allowed ?? true,
      retryAfterSec: opts.allowed === false ? 60 : 0,
    }),
  );
  const promptPreviewRateLimiter: PromptPreviewRateLimiter = { tryConsume };

  const container = {
    clock: { now: () => new Date("2026-06-10T00:00:00.000Z") },
    promptResolver,
    llmProvider,
    promptPreviewRateLimiter,
  } as unknown as RequestContainer;

  return {
    container,
    resolveFor,
    structureToHtml,
    suggestMetadata,
    tryConsume,
  };
}

describe("previewPrompt", () => {
  it("(a) calls structureToHtml once, injecting the override for the previewed purpose and resolver values for the others", async () => {
    const { container, structureToHtml } = makeContainer({
      resolved: { structure: "S", title: "T", directory: "D" },
    });

    const out = await previewPrompt({
      container,
      input: {
        actorUserId: ACTOR,
        purpose: "title",
        sampleText: "raw sample",
        overridePrompt: "MY TITLE PROMPT",
      },
    });

    expect(structureToHtml).toHaveBeenCalledTimes(1);
    const call = structureToHtml.mock.calls[0][0] as LLMStructureInput;
    expect(call.titlePrompt).toBe("MY TITLE PROMPT");
    expect(call.prompt).toBe("S");
    expect(call.directoryPrompt).toBe("D");
    expect(call.existingDirectories).toEqual([]);
    expect(out).toMatchObject({
      kind: "structure",
      titleSuggestion: "A Title",
    });
  });

  it("(b) calls suggestMetadata with the sample text as html for metadata", async () => {
    const { container, suggestMetadata, structureToHtml } = makeContainer({
      resolved: { metadata: "META" },
      llm: { metadata: { tags: ["x"], aliases: ["y"] } },
    });

    const out = await previewPrompt({
      container,
      input: {
        actorUserId: ACTOR,
        purpose: "metadata",
        sampleText: "<p>html</p>",
      },
    });

    expect(structureToHtml).not.toHaveBeenCalled();
    expect(suggestMetadata).toHaveBeenCalledTimes(1);
    const call = suggestMetadata.mock.calls[0][0] as LLMMetadataInput;
    expect(call.html).toBe("<p>html</p>");
    expect(call.prompt).toBe("META");
    expect(out).toEqual({ kind: "metadata", tags: ["x"], aliases: ["y"] });
  });

  it("(c) uses the resolver value when overridePrompt is empty / absent", async () => {
    const { container, suggestMetadata } = makeContainer({
      resolved: { metadata: "RESOLVED_META" },
    });

    await previewPrompt({
      container,
      input: {
        actorUserId: ACTOR,
        purpose: "metadata",
        sampleText: "<p>x</p>",
        overridePrompt: "   ",
      },
    });

    const call = suggestMetadata.mock.calls[0][0] as LLMMetadataInput;
    expect(call.prompt).toBe("RESOLVED_META");
  });

  it.each([
    [new LLMRateLimitError("rl"), IngestionErrorCode.LLMRateLimited],
    [new LLMQuotaExceededError("q"), IngestionErrorCode.LLMQuotaExceeded],
    [new LLMUnavailableError("u"), "llm_failure"],
    [new LLMTimeoutError("t"), "llm_failure"],
  ])("(d) translates %s to the expected business code", async (thrown, expectedCode) => {
    const { container } = makeContainer({
      llm: {
        structure: () => Promise.reject(thrown),
      },
    });

    await expect(
      previewPrompt({
        container,
        input: {
          actorUserId: ACTOR,
          purpose: "structure",
          sampleText: "raw",
        },
      }),
    ).rejects.toSatisfy(
      (e: unknown) => isBusinessRuleError(e) && e.code === expectedCode,
    );
  });

  it("(e) throws prompt_preview_rate_limited when the limiter denies the attempt", async () => {
    const { container, structureToHtml } = makeContainer({ allowed: false });

    await expect(
      previewPrompt({
        container,
        input: { actorUserId: ACTOR, purpose: "structure", sampleText: "raw" },
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        isBusinessRuleError(e) &&
        e.code === IngestionErrorCode.PromptPreviewRateLimited,
    );
    // The LLM must never be called once the limiter denies the request.
    expect(structureToHtml).not.toHaveBeenCalled();
  });

  it("(f) translates a StubLLMProvider unsupported_format BusinessRuleError to llm_preview_unavailable", async () => {
    const { container } = makeContainer({
      llm: {
        structure: () =>
          Promise.reject(
            new BusinessRuleError(
              IngestionErrorCode.UnsupportedFormat,
              "llm_not_implemented_in_mvp",
            ),
          ),
      },
    });

    await expect(
      previewPrompt({
        container,
        input: { actorUserId: ACTOR, purpose: "directory", sampleText: "raw" },
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        isBusinessRuleError(e) &&
        e.code === IngestionErrorCode.LLMPreviewUnavailable,
    );
  });
});
