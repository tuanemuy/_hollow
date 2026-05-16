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

/**
 * Resolved configuration for the Anthropic adapter. Captured up-front so
 * the adapter does not have to reach into the environment on every call —
 * lets the DI layer fail fast at boot if the api key is missing.
 */
export type AnthropicLLMConfig = Readonly<{
  /** Anthropic API key. Sourced from env (preferred) or DB ciphertext. */
  apiKey: string;
  /** Messages-API model id (e.g. `claude-3-5-sonnet-latest`). */
  model: string;
  /** Optional override for the Messages API endpoint (defaults to public Anthropic). */
  endpoint?: string;
  /** Anthropic API version header. Defaults to the value used at template-write time. */
  apiVersion?: string;
  /**
   * Wall-clock budget per request in milliseconds. Translates to
   * `AbortController.signal`; the adapter surfaces a deadline hit as
   * `LLMTimeoutError`.
   */
  timeoutMs?: number;
  /**
   * Maximum tokens the model may produce per call. Conservative default
   * keeps cost predictable; ingestion usecases can override via DI.
   */
  maxTokens?: number;
}>;

const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_API_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 4096;

type AnthropicContentBlock =
  | Readonly<{ type: "text"; text: string }>
  // Anthropic forwards additional block types (tool_use / image / etc.)
  // that the ingestion pipeline does not request. Tagged here for
  // structural narrowing — the deserialiser skips anything that is not
  // a `text` block rather than failing.
  | Readonly<{ type: string }>;

type AnthropicMessageResponse = Readonly<{
  content?: readonly AnthropicContentBlock[];
}>;

type AnthropicErrorBody = Readonly<{
  error?: Readonly<{ type?: string; message?: string }>;
}>;

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function isTransientNetworkError(error: unknown): boolean {
  // `fetch` failures inside the Workers runtime surface as `TypeError`
  // with a "fetch failed" / "network" style message. Treating them as
  // unavailable lets the worker retry rather than failing the job
  // permanently. AbortError is handled separately upstream of this.
  if (error instanceof TypeError) return true;
  return false;
}

function extractTextContent(body: AnthropicMessageResponse): string {
  if (!body.content) return "";
  const parts: string[] = [];
  for (const block of body.content) {
    if (
      block.type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.join("\n").trim();
}

/**
 * Anthropic Messages API adapter for {@link LLMProvider}.
 *
 * `fetch`-based by design — no SDK dependency keeps the adapter
 * compatible with the Cloudflare Workers runtime where the global
 * `fetch` is the canonical HTTP client. The implementation is the only
 * production target per `spec/adr/004-llm-provider-single-fixed.md`
 * (MVP fixes the provider to Anthropic). Adding a second provider
 * lands as a sibling file under `app/core/adapters/llm/`.
 *
 * Error mapping (per the port contract in
 * `app/core/domain/ingestion/ports/llmProvider.ts`):
 * - HTTP 429 → `LLMRateLimitError`
 * - HTTP 5xx → `LLMUnavailableError`
 * - HTTP 403 with quota / billing wording → `LLMQuotaExceededError`
 * - `AbortError` (deadline lapsed) → `LLMTimeoutError`
 * - Network `TypeError` → `LLMUnavailableError`
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
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(private readonly config: AnthropicLLMConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("AnthropicLLMProvider: apiKey is empty");
    }
    if (config.model.length === 0) {
      throw new Error("AnthropicLLMProvider: model is empty");
    }
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
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
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
          "anthropic-version": this.apiVersion,
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.maxTokens,
          system,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: user }],
            },
          ],
        }),
        signal: controller.signal,
      });
    } catch (cause) {
      if (isAbortError(cause)) {
        throw new LLMTimeoutError(
          `Anthropic request aborted after ${this.timeoutMs}ms`,
          cause,
        );
      }
      if (isTransientNetworkError(cause)) {
        throw new LLMUnavailableError(
          "Network error while calling Anthropic Messages API",
          cause,
        );
      }
      throw new LLMUnavailableError(
        "Unexpected error while calling Anthropic Messages API",
        cause,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      await this.throwForStatus(response);
    }

    let body: AnthropicMessageResponse;
    try {
      body = (await response.json()) as AnthropicMessageResponse;
    } catch (cause) {
      throw new LLMUnavailableError(
        "Anthropic response was not valid JSON",
        cause,
      );
    }
    const text = extractTextContent(body);
    if (text.length === 0) {
      throw new LLMUnavailableError(
        "Anthropic response did not contain any text content",
      );
    }
    return text;
  }

  private async throwForStatus(response: Response): Promise<never> {
    const status = response.status;
    let detail = "";
    let errorType: string | undefined;
    try {
      const body = (await response.json()) as AnthropicErrorBody;
      if (body.error) {
        errorType = body.error.type;
        detail = body.error.message ?? "";
      }
    } catch {
      // Body might be plain text or empty; fall back to status text below.
    }
    const detailSuffix = detail.length > 0 ? `: ${detail}` : "";
    if (status === 429) {
      throw new LLMRateLimitError(
        `Anthropic rate limit (HTTP 429)${detailSuffix}`,
      );
    }
    if (status === 403) {
      // Anthropic's billing / quota responses arrive as 403 with a
      // tagged `error.type`. Anything else 403 is treated as a permanent
      // unavailability so the worker does not retry forever.
      if (
        errorType === "permission_error" ||
        /quota|credit|billing/i.test(detail)
      ) {
        throw new LLMQuotaExceededError(
          `Anthropic quota / billing failure (HTTP 403)${detailSuffix}`,
        );
      }
      throw new LLMUnavailableError(
        `Anthropic permission failure (HTTP 403)${detailSuffix}`,
      );
    }
    if (status >= 500 && status < 600) {
      throw new LLMUnavailableError(
        `Anthropic upstream failure (HTTP ${status})${detailSuffix}`,
      );
    }
    // 4xx (other than the special cases) typically indicate a malformed
    // request — surface as unavailable so the worker quarantines the
    // job rather than burning retries on an unrecoverable shape.
    throw new LLMUnavailableError(
      `Anthropic request failed (HTTP ${status})${detailSuffix}`,
    );
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
