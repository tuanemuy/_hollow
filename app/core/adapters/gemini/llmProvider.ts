import { extractJsonObject } from "@/core/adapters/llm/jsonEnvelope";
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
import {
  callGeminiGenerate,
  type GeminiErrorMapper,
  type GeminiSharedConfig,
} from "./messagesClient";

/**
 * Label type for LLM-mode Gemini adapter config. Structurally identical
 * to {@link GeminiSharedConfig} — see that type for field-level
 * documentation. Retained as a named alias so existing callers
 * (`new GeminiLLMProvider({ apiKey, model })`) stay stable and LLM-mode
 * grep hits remain meaningful.
 */
export type GeminiLLMConfig = GeminiSharedConfig;

const llmErrorMapper: GeminiErrorMapper = {
  rateLimit: (message, cause) => new LLMRateLimitError(message, cause),
  unavailable: (message, cause) => new LLMUnavailableError(message, cause),
  timeout: (message, cause) => new LLMTimeoutError(message, cause),
  quota: (message, cause) => new LLMQuotaExceededError(message, cause),
} as const;

const RETRY_SYSTEM_SUFFIX =
  "Your previous reply was not parseable JSON. Reply with a single JSON object only, no prose, no fences.";

/**
 * Google Gemini `generateContent` adapter for {@link LLMProvider}.
 *
 * Delegates the HTTP / timeout / status-mapping mechanics to
 * {@link callGeminiGenerate}, supplying a {@link GeminiErrorMapper} that
 * translates each provider failure into the LLM-port error class:
 * - HTTP 429 → `LLMRateLimitError`
 * - HTTP 5xx → `LLMUnavailableError`
 * - HTTP 401 / 403 → `LLMQuotaExceededError`
 * - `AbortError` (deadline lapsed) → `LLMTimeoutError`
 * - Network `TypeError` / other unexpected throws → `LLMUnavailableError`
 *
 * Empty-response semantics differ from OCR / PDF: the LLM port's JSON
 * envelope contract cannot accept an empty body, so `invoke()`
 * re-introduces the empty-string check after the helper call. See
 * `messagesClient.ts` JSDoc ("Empty-response contract").
 *
 * Response shape contract: the model is asked for a single-line JSON
 * envelope. The structured-output flag (`responseMimeType:
 * "application/json"`) is set so Gemini enforces JSON at the API level.
 * Robust extraction (`extractJsonObject`) still tolerates fences and
 * leading prose. On parse / shape failure the adapter retries once with
 * an appended "previous reply was not parseable JSON" hint in the
 * system prompt; the second failure surfaces as `LLMUnavailableError`
 * with "after 1 retry" in the message (Issue #227 ADR-001).
 */
export class GeminiLLMProvider implements LLMProvider {
  private readonly config: GeminiSharedConfig;

  constructor(config: GeminiLLMConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("GeminiLLMProvider: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("GeminiLLMProvider: model is empty");
    }
    this.config = config;
  }

  async structureToHtml(input: LLMStructureInput): Promise<LLMStructureResult> {
    const system = this.buildStructureSystemPrompt(input);
    const userMessage = this.buildStructureUserMessage(input);
    const envelope = await this.invokeWithRetry(system, userMessage, (raw) => {
      const parsed = extractJsonObject(raw);
      if (parsed === null) return null;
      if (
        typeof parsed.html !== "string" ||
        typeof parsed.titleSuggestion !== "string"
      ) {
        return null;
      }
      return parsed;
    });
    const html = this.requireString(envelope, "html");
    const titleSuggestion = this.requireString(envelope, "titleSuggestion");
    const directorySuggestionRaw = envelope.directorySuggestion;
    const directorySuggestion =
      typeof directorySuggestionRaw === "string" &&
      directorySuggestionRaw.trim().length > 0
        ? directorySuggestionRaw
        : null;
    return {
      html,
      titleSuggestion,
      directorySuggestion,
    };
  }

  async suggestMetadata(input: LLMMetadataInput): Promise<LLMMetadataResult> {
    const system = this.buildMetadataSystemPrompt(input);
    const userMessage = this.buildMetadataUserMessage(input);
    const envelope = await this.invokeWithRetry(system, userMessage, (raw) => {
      const parsed = extractJsonObject(raw);
      if (parsed === null) return null;
      if (!Array.isArray(parsed.tags) || !Array.isArray(parsed.aliases)) {
        return null;
      }
      return parsed;
    });
    const tags = this.requireStringArray(envelope, "tags");
    const aliases = this.requireStringArray(envelope, "aliases");
    return { tags, aliases };
  }

  private buildStructureSystemPrompt(input: LLMStructureInput): string {
    const base =
      input.prompt.trim().length > 0
        ? input.prompt
        : "You convert raw note material into a sanitised HTML draft.";
    return [
      base,
      `Respond with a single JSON object on one line with the keys "html" (string), "titleSuggestion" (string), and "directorySuggestion" (string or null).`,
      `Locale for natural-language output: ${input.locale}.`,
      "Do not include code fences. Do not include any text before or after the JSON object.",
    ].join("\n");
  }

  private buildStructureUserMessage(input: LLMStructureInput): string {
    return `Source text:\n${input.rawText}`;
  }

  private buildMetadataSystemPrompt(input: LLMMetadataInput): string {
    const base =
      input.prompt.trim().length > 0
        ? input.prompt
        : "You extract tag names and aliases from an HTML note body.";
    return [
      base,
      `Respond with a single JSON object on one line with the keys "tags" (string[]) and "aliases" (string[]).`,
      "Do not include code fences. Do not include any text before or after the JSON object.",
    ].join("\n");
  }

  private buildMetadataUserMessage(input: LLMMetadataInput): string {
    return `HTML body:\n${input.html}`;
  }

  private async invoke(system: string, user: string): Promise<string> {
    const text = await callGeminiGenerate(
      this.config,
      system,
      [{ text: user }],
      llmErrorMapper,
      { responseMimeType: "application/json" },
    );
    if (text.length === 0) {
      throw new LLMUnavailableError(
        "Gemini response did not contain any text content",
      );
    }
    return text;
  }

  private async invokeWithRetry(
    system: string,
    user: string,
    validate: (raw: string) => Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    const firstText = await this.invoke(system, user);
    const firstParsed = validate(firstText);
    if (firstParsed !== null) return firstParsed;

    const retrySystem = `${system}\n${RETRY_SYSTEM_SUFFIX}`;
    let secondText: string;
    try {
      secondText = await this.invoke(retrySystem, user);
    } catch (cause) {
      throw new LLMUnavailableError(
        "Gemini response was not a JSON envelope after 1 retry",
        cause,
      );
    }
    const secondParsed = validate(secondText);
    if (secondParsed !== null) return secondParsed;

    throw new LLMUnavailableError(
      "Gemini response was not a JSON envelope after 1 retry",
    );
  }

  private requireString(
    envelope: Record<string, unknown>,
    key: string,
  ): string {
    const value = envelope[key];
    if (typeof value !== "string") {
      throw new LLMUnavailableError(
        `Gemini response missing required string field "${key}"`,
      );
    }
    return value;
  }

  private requireStringArray(
    envelope: Record<string, unknown>,
    key: string,
  ): readonly string[] {
    const value = envelope[key];
    if (!Array.isArray(value)) {
      throw new LLMUnavailableError(
        `Gemini response field "${key}" must be an array`,
      );
    }
    return value.filter((v): v is string => typeof v === "string");
  }
}
