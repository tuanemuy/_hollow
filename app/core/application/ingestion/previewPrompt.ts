import { BusinessRuleError, isBusinessRuleError } from "@/core/domain/error";
import { UserId as IdentityUserId } from "@/core/domain/identity/valueObject";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  isLLMQuotaExceededError,
  isLLMRateLimitError,
  isLLMTimeoutError,
  isLLMUnavailableError,
} from "@/core/domain/ingestion/ports/llmProvider";
import type { IngestionPromptPurpose } from "@/core/domain/ingestion/ports/promptResolver";
import type { ServiceArgs } from "../types";

/**
 * Preview-capable purposes. `ocr_assist` is intentionally excluded — the
 * `LLMProvider` port has no execution path for it, so the UI shows a
 * "preview unavailable" state instead (ADR-001).
 */
export type PreviewPromptPurpose =
  | "structure"
  | "title"
  | "directory"
  | "metadata";

export type PreviewPromptInput = Readonly<{
  actorUserId: string;
  purpose: PreviewPromptPurpose;
  sampleText: string;
  /**
   * The in-progress edit. When non-empty it is injected into the
   * purpose's prompt field; when empty the resolver's effective value is
   * used (same precedence the ingestion pipeline applies).
   */
  overridePrompt?: string;
}>;

/**
 * Structured-text preview output (structure / title / directory). All
 * three share one `structureToHtml` call; the UI surfaces the field that
 * matches the previewed purpose (ADR-002).
 */
export type PreviewStructureOutput = Readonly<{
  kind: "structure";
  html: string;
  titleSuggestion: string;
  directorySuggestion: string | null;
}>;

/** Metadata preview output (tags / aliases) from `suggestMetadata`. */
export type PreviewMetadataOutput = Readonly<{
  kind: "metadata";
  tags: readonly string[];
  aliases: readonly string[];
}>;

export type PreviewPromptOutput =
  | PreviewStructureOutput
  | PreviewMetadataOutput;

/**
 * Runs a real LLM call against an in-progress prompt so the user can see
 * the actual output before saving. No aggregate is mutated, so this runs
 * outside any unit of work (mirrors `runIngestionJob`'s LLM call placement).
 *
 * Guards, in order:
 * 1. Per-user fixed-window rate limit (`promptPreviewRateLimiter`).
 * 2. Real LLM call, with transport errors translated to honest
 *    `BusinessRuleError` codes (never a fake output — ADR-005).
 *
 * `existingDirectories` is intentionally empty: a preview has no upload
 * context, so a directory suggestion is always rendered as a new-name
 * proposal rather than matched against the user's tree.
 */
export async function previewPrompt({
  container,
  input,
}: ServiceArgs<PreviewPromptInput>): Promise<PreviewPromptOutput> {
  const now = container.clock.now();
  // Consume a slot *before* the LLM call and never refund it on failure.
  // This is the deliberate fail-safe choice: a request that reaches the
  // provider has already incurred (or risked) billable cost, so a failed
  // attempt must still count against the quota to prevent abuse / billing
  // DoS via repeatedly-failing previews (ADR-008).
  const decision = await container.promptPreviewRateLimiter.tryConsume(
    input.actorUserId,
    now,
  );
  if (!decision.allowed) {
    throw new BusinessRuleError(
      IngestionErrorCode.PromptPreviewRateLimited,
      "prompt preview rate limit exceeded",
    );
  }

  const ownerId = IdentityUserId.create(input.actorUserId);
  const override = input.overridePrompt ?? "";
  const hasOverride = override.trim().length > 0;

  // Resolve a single purpose's effective prompt, preferring the in-progress
  // override for the purpose being previewed.
  const resolveFor = (purpose: IngestionPromptPurpose): Promise<string> =>
    hasOverride && purpose === input.purpose
      ? Promise.resolve(override)
      : container.promptResolver.resolveFor(ownerId, purpose);

  try {
    if (input.purpose === "metadata") {
      const prompt = await resolveFor("metadata");
      const result = await container.llmProvider.suggestMetadata({
        html: input.sampleText,
        prompt,
      });
      return {
        kind: "metadata",
        tags: result.tags,
        aliases: result.aliases,
      };
    }

    // structure / title / directory all flow through one structureToHtml
    // call (the port offers no split execution — ADR-002). Inject the
    // override only for the previewed purpose; resolve the other two.
    const [prompt, titlePrompt, directoryPrompt] = await Promise.all([
      resolveFor("structure"),
      resolveFor("title"),
      resolveFor("directory"),
    ]);
    const result = await container.llmProvider.structureToHtml({
      rawText: input.sampleText,
      prompt,
      titlePrompt,
      directoryPrompt,
      locale: "ja",
      existingDirectories: [],
    });
    return {
      kind: "structure",
      html: result.html,
      titleSuggestion: result.titleSuggestion,
      directorySuggestion: result.directorySuggestion,
    };
  } catch (error) {
    throw translateLLMError(error);
  }
}

/**
 * Translate raw LLM transport errors into honest preview business codes.
 * The preview path never sends a file, so a `StubLLMProvider`'s
 * `unsupported_format` BusinessRuleError is unambiguously "LLM not
 * configured" — translated to `llm_preview_unavailable` without sniffing
 * the message (ADR-005).
 */
function translateLLMError(error: unknown): BusinessRuleError<string> {
  if (isLLMRateLimitError(error)) {
    return new BusinessRuleError(
      IngestionErrorCode.LLMRateLimited,
      "llm rate limited",
    );
  }
  if (isLLMQuotaExceededError(error)) {
    return new BusinessRuleError(
      IngestionErrorCode.LLMQuotaExceeded,
      "llm quota exceeded",
    );
  }
  if (isLLMUnavailableError(error) || isLLMTimeoutError(error)) {
    return new BusinessRuleError(
      "llm_failure" as IngestionErrorCode,
      "llm unavailable",
    );
  }
  if (
    isBusinessRuleError(error) &&
    error.code === IngestionErrorCode.UnsupportedFormat
  ) {
    return new BusinessRuleError(
      IngestionErrorCode.LLMPreviewUnavailable,
      "llm preview unavailable",
    );
  }
  // Any other BusinessRuleError reaching the preview path signals a state
  // where preview cannot run. Collapse it (and any non-business error) into
  // `llm_preview_unavailable` so the user sees the honest dedicated message
  // rather than errorDisplay's generic business fallback, and so no internal
  // detail leaks.
  return new BusinessRuleError(
    IngestionErrorCode.LLMPreviewUnavailable,
    "llm preview failed",
  );
}
