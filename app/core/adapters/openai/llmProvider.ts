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
  callOpenAIMessages,
  type OpenAIErrorMapper,
  type OpenAISharedConfig,
} from "./messagesClient";

/**
 * Label type for LLM-mode OpenAI adapter config. Structurally identical
 * to {@link OpenAISharedConfig}.
 */
export type OpenAILLMConfig = OpenAISharedConfig;

const llmErrorMapper: OpenAIErrorMapper = {
  rateLimit: (message, cause) => new LLMRateLimitError(message, cause),
  unavailable: (message, cause) => new LLMUnavailableError(message, cause),
  timeout: (message, cause) => new LLMTimeoutError(message, cause),
  quota: (message, cause) => new LLMQuotaExceededError(message, cause),
} as const;

const RETRY_SYSTEM_SUFFIX =
  "Your previous reply was not parseable JSON. Reply with a single JSON object only, no prose, no fences.";

/**
 * OpenAI-compatible Chat Completions adapter for {@link LLMProvider}.
 *
 * Delegates the HTTP / timeout / status-mapping mechanics to
 * {@link callOpenAIMessages}, supplying an {@link OpenAIErrorMapper}
 * that translates each provider failure into the LLM-port error class:
 * - HTTP 429 → `LLMRateLimitError` (or `LLMQuotaExceededError` for
 *   `insufficient_quota`)
 * - HTTP 5xx → `LLMUnavailableError`
 * - HTTP 401 / 403 → `LLMQuotaExceededError`
 * - `AbortError` (deadline lapsed) → `LLMTimeoutError`
 * - Network `TypeError` / other unexpected throws → `LLMUnavailableError`
 *
 * Response shape contract: the model is asked for a single-line JSON
 * envelope. The structured-output flag (`response_format:
 * { type: "json_object" }`) is set so OpenAI enforces JSON at the API
 * level. Robust extraction (`extractJsonObject`) still tolerates fences
 * and leading prose. On parse / shape failure the adapter retries once
 * with an appended "previous reply was not parseable JSON" hint in the
 * system prompt; the second failure surfaces as `LLMUnavailableError`
 * with "after 1 retry" in the message (Issue #227 ADR-001).
 *
 * The `response_format` parameter is supported by `gpt-4o*`, `gpt-4.1*`,
 * and other current OpenAI models. Legacy / Azure deployments that do
 * not accept it will surface HTTP 400 → `LLMUnavailableError`; model
 * compatibility is the caller's responsibility (Issue #227 ADR-005).
 *
 * Empty assistant content is rejected here because the JSON envelope
 * contract cannot accept it.
 */
export class OpenAILLMProvider implements LLMProvider {
  private readonly config: OpenAISharedConfig;

  constructor(config: OpenAILLMConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("OpenAILLMProvider: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("OpenAILLMProvider: model is empty");
    }
    this.config = config;
  }

  async structureToHtml(input: LLMStructureInput): Promise<LLMStructureResult> {
    const system = this.buildStructureSystemPrompt(input);
    const userMessage = this.buildStructureUserMessage(input);
    const envelope = await this.invokeWithRetry(system, userMessage, (raw) => {
      const parsed = extractJsonObject(raw);
      if (parsed === null) return null;
      const html = parsed.html;
      const titleSuggestion = parsed.titleSuggestion;
      if (typeof html !== "string" || typeof titleSuggestion !== "string") {
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
    const text = await callOpenAIMessages(
      this.config,
      system,
      [{ type: "text", text: user }],
      llmErrorMapper,
      { responseFormat: { type: "json_object" } },
    );
    if (text.length === 0) {
      throw new LLMUnavailableError(
        "OpenAI response did not contain any text content",
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

    // Retry once with a stronger system prompt. Throws from invoke()
    // (LLMRateLimitError / LLMQuotaExceededError / LLMTimeoutError) must
    // propagate unchanged so runIngestionJob's queue-redelivery and
    // markFailed paths keep their semantics — see ADR-001.
    const retrySystem = `${system}\n${RETRY_SYSTEM_SUFFIX}`;
    const secondText = await this.invoke(retrySystem, user);
    const secondParsed = validate(secondText);
    if (secondParsed !== null) return secondParsed;

    throw new LLMUnavailableError(
      "OpenAI response was not a JSON envelope after 1 retry",
    );
  }

  private requireString(
    envelope: Record<string, unknown>,
    key: string,
  ): string {
    const value = envelope[key];
    if (typeof value !== "string") {
      throw new LLMUnavailableError(
        `OpenAI response missing required string field "${key}"`,
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
        `OpenAI response field "${key}" must be an array`,
      );
    }
    return value.filter((v): v is string => typeof v === "string");
  }
}
