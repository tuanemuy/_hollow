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
  type AnthropicErrorMapper,
  type AnthropicSharedConfig,
  callAnthropicMessages,
} from "./messagesClient";

/**
 * Label type for LLM-mode Anthropic adapter config. Structurally
 * identical to {@link AnthropicSharedConfig} — see that type for
 * field-level documentation. Retained as a named alias so existing
 * callers (`new AnthropicLLMProvider({ apiKey, model })`) stay stable
 * and LLM-mode grep hits remain meaningful. If LLM-only fields become
 * necessary in the future, this alias should be promoted to an
 * intersection (`AnthropicSharedConfig & { ... }`) or an interface at
 * that time — the alias-as-is cannot carry extra fields.
 */
export type AnthropicLLMConfig = AnthropicSharedConfig;

const llmErrorMapper: AnthropicErrorMapper = {
  rateLimit: (message, cause) => new LLMRateLimitError(message, cause),
  unavailable: (message, cause) => new LLMUnavailableError(message, cause),
  timeout: (message, cause) => new LLMTimeoutError(message, cause),
  quota: (message, cause) => new LLMQuotaExceededError(message, cause),
} as const;

const RETRY_SYSTEM_SUFFIX =
  "Your previous reply was not parseable JSON. Reply with a single JSON object only, no prose, no fences.";

const RETRY_PREFILL = "{";

/**
 * Anthropic Messages API adapter for {@link LLMProvider}.
 *
 * Delegates the HTTP / timeout / status-mapping mechanics to
 * {@link callAnthropicMessages}, supplying an
 * {@link AnthropicErrorMapper} that translates each provider failure
 * into the LLM-port error class:
 * - HTTP 429 → `LLMRateLimitError`
 * - HTTP 5xx → `LLMUnavailableError`
 * - HTTP 403 with quota / billing wording → `LLMQuotaExceededError`
 * - `AbortError` (deadline lapsed) → `LLMTimeoutError`
 * - Network `TypeError` / other unexpected throws → `LLMUnavailableError`
 *
 * Empty-response semantics differ from OCR / PDF: the LLM port's JSON
 * envelope contract cannot accept an empty body, so `invoke()`
 * re-introduces the empty-string check after the helper call. See
 * `messagesClient.ts` JSDoc ("Empty-response contract") and
 * Issue #113 ADR-002 for the cross-port reasoning.
 *
 * Response shape contract:
 * - `structureToHtml` asks the model to emit a strict JSON envelope
 *   `{ "html", "titleSuggestion", "directorySuggestion" }`. The adapter
 *   parses the envelope from the first `text` content block; any
 *   deviation (missing keys, non-JSON output) triggers one retry with an
 *   appended "previous reply was not parseable JSON" hint AND an
 *   assistant `{` prefill that forces the next response to start as a
 *   JSON object (Issue #227 ADR-003). The second failure surfaces as
 *   `LLMUnavailableError` with "after 1 retry" in the message.
 * - `suggestMetadata` asks for `{ "tags": string[], "aliases": string[] }`.
 *   The same JSON-envelope contract and retry-with-prefill apply;
 *   non-string entries are filtered out at the boundary.
 *
 * Anthropic does not expose an OpenAI-style `response_format: json_object`
 * flag, so tool-use would be required for API-level JSON enforcement.
 * That is out of scope for #227 — robust parsing + retry + prefill is
 * sufficient for the completion criteria (see ADR-003).
 */
export class AnthropicLLMProvider implements LLMProvider {
  private readonly config: AnthropicSharedConfig;

  constructor(config: AnthropicLLMConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("AnthropicLLMProvider: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("AnthropicLLMProvider: model is empty");
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

  private async invoke(
    system: string,
    user: string,
    prefill?: string,
  ): Promise<string> {
    const text = await callAnthropicMessages(
      this.config,
      system,
      [{ type: "text", text: user }],
      llmErrorMapper,
      prefill,
    );
    // LLM port's JSON envelope contract cannot accept an empty body.
    // The helper returns "" to satisfy OCR / PDF's "empty OK" contract
    // (messagesClient.ts JSDoc "Empty-response contract" /
    // Issue #113 ADR-002), so we re-introduce the empty-string check
    // here. The helper's extractTextContent() is already trim()-ed, but
    // this length check is still required to reject `content: []` and
    // tool_use-only responses that legitimately yield "".
    if (text.length === 0) {
      throw new LLMUnavailableError(
        "Anthropic response did not contain any text content",
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

    // Retry once with a stronger system prompt and a `{` prefill so the
    // model continues the assistant turn from a JSON object opener.
    //
    // Two semantics to handle:
    // 1. The prefill character is NOT echoed in the returned text
    //    (Anthropic API semantics), so a `{`-less continuation like
    //    `"html":"...",}` is expected — re-prepend `{` to parse.
    // 2. Throws from invoke() (LLMRateLimitError / LLMQuotaExceededError
    //    / LLMTimeoutError) propagate unchanged so runIngestionJob's
    //    queue-redelivery and markFailed paths keep their semantics —
    //    see ADR-001.
    const retrySystem = `${system}\n${RETRY_SYSTEM_SUFFIX}`;
    const secondText = await this.invoke(retrySystem, user, RETRY_PREFILL);
    const startsWithBrace = secondText.trimStart().startsWith("{");
    const secondParsed = startsWithBrace
      ? validate(secondText)
      : (validate(secondText) ?? validate(`${RETRY_PREFILL}${secondText}`));
    if (secondParsed !== null) return secondParsed;

    throw new LLMUnavailableError(
      "Anthropic response was not a JSON envelope after 1 retry",
    );
  }

  private requireString(
    envelope: Record<string, unknown>,
    key: string,
  ): string {
    const value = envelope[key];
    if (typeof value !== "string") {
      throw new LLMUnavailableError(
        `Anthropic response missing required string field "${key}"`,
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
        `Anthropic response field "${key}" must be an array`,
      );
    }
    return value.filter((v): v is string => typeof v === "string");
  }
}
