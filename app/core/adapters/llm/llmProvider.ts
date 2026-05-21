import { BusinessRuleError } from "@/core/domain/error";
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
import {
  type AnthropicErrorMapper,
  type AnthropicSharedConfig,
  callAnthropicMessages,
} from "./anthropicMessagesClient";

/**
 * Label type for LLM-mode Anthropic adapter config. Structurally
 * identical to {@link AnthropicSharedConfig} — see that type for
 * field-level documentation. Retained as a named alias so existing
 * callers (`new AnthropicLLMProvider({ apiKey, model })`) and LLM-mode
 * grep hits stay stable, and so future LLM-only fields (e.g.
 * `temperature?`) can be layered on without churning every call site.
 */
export type AnthropicLLMConfig = AnthropicSharedConfig;

const llmErrorMapper: AnthropicErrorMapper = {
  rateLimit: (message, cause) => new LLMRateLimitError(message, cause),
  unavailable: (message, cause) => new LLMUnavailableError(message, cause),
  timeout: (message, cause) => new LLMTimeoutError(message, cause),
  quota: (message, cause) => new LLMQuotaExceededError(message, cause),
} as const;

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
 * `anthropicMessagesClient.ts` JSDoc ("Empty-response contract") and
 * Issue #113 ADR-002 for the cross-port reasoning.
 *
 * Response shape contract:
 * - `structureToHtml` asks the model to emit a strict JSON envelope
 *   `{ "html", "titleSuggestion", "directorySuggestion" }`. The adapter
 *   parses the envelope from the first `text` content block; any
 *   deviation (missing keys, non-JSON output) is translated into
 *   `LLMUnavailableError` so the retry policy can re-run with the same
 *   contract. `html` returned here is *not* yet sanitised — the
 *   ingestion pipeline pipes it through `HtmlSanitizer` before persisting.
 * - `suggestMetadata` asks for `{ "tags": string[], "aliases": string[] }`.
 *   The same JSON-envelope contract applies; non-string entries are
 *   filtered out at the boundary.
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
    const text = await this.invoke(system, userMessage);
    const envelope = this.parseJsonEnvelope(text);
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
    const text = await this.invoke(system, userMessage);
    const envelope = this.parseJsonEnvelope(text);
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
    const text = await callAnthropicMessages(
      this.config,
      system,
      [{ type: "text", text: user }],
      llmErrorMapper,
    );
    // OCR / PDF と異なり、LLM port の JSON envelope contract は
    // 空文字を許容しない。helper は OCR / PDF の「空 OK」契約に合わせて
    // "" を返す (anthropicMessagesClient.ts JSDoc "Empty-response
    // contract" / Issue #113 ADR-002) ため、LLM 側で再導入する。
    // helper 側 `extractTextContent` が `.trim()` 済みでも、この length
    // check は冗長ではない (`content: []` / `tool_use` のみのケースで
    // "" が返るのを弾くため恒久的に必要)。
    if (text.length === 0) {
      throw new LLMUnavailableError(
        "Anthropic response did not contain any text content",
      );
    }
    return text;
  }

  private parseJsonEnvelope(text: string): Record<string, unknown> {
    // Models occasionally wrap their JSON in a code fence even when
    // instructed not to; strip a single leading/trailing fence pair so
    // the parser does not have to be lenient elsewhere.
    const trimmed = text.trim();
    const fenced = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    try {
      const parsed = JSON.parse(fenced) as unknown;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("envelope is not a JSON object");
      }
      return parsed as Record<string, unknown>;
    } catch (cause) {
      throw new LLMUnavailableError(
        "Anthropic response was not a JSON envelope",
        cause,
      );
    }
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

/**
 * MVP LLM adapter.
 *
 * Real LLM-backed structuring (`structureToHtml` / `suggestMetadata`)
 * requires admin-supplied credentials and a chosen model — both come
 * from the persisted `LLMConfig` which is not yet wired through the
 * container at construction time. The usecase layer surfaces the
 * resulting `BusinessRuleError` as a non-retryable "feature not
 * available yet" so the ingestion job transitions to `failed` with a
 * clear error code rather than burning worker retries.
 *
 * MVP 内では LLM 経由の構造化は未対応。実 adapter を投入する場合は
 * 本クラスを `AnthropicLLMProvider` に差し替える。
 */
export class StubLLMProvider implements LLMProvider {
  async structureToHtml(
    _input: LLMStructureInput,
  ): Promise<LLMStructureResult> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "llm_not_implemented_in_mvp",
    );
  }

  async suggestMetadata(_input: LLMMetadataInput): Promise<LLMMetadataResult> {
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      "llm_not_implemented_in_mvp",
    );
  }
}
