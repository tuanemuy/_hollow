/**
 * Shared HTTP client for OpenAI-compatible Chat Completions endpoints.
 *
 * Used by `OpenAILLMProvider`, `OpenAIOCRProvider`, `OpenAIPDFExtractor`,
 * and `pingOpenAI` to avoid duplicating fetch + timeout + status
 * mapping logic. Each caller supplies an {@link OpenAIErrorMapper} so
 * port-specific error classes (`OCRFailureError`, `PDFParseError`,
 * `LLMRateLimitError`, …) can be thrown without leaking provider-native
 * error types upward.
 *
 * Mirrors the shape of `app/core/adapters/anthropic/messagesClient.ts`.
 *
 * URL composition (ADR-001 of Issue #101):
 * - `baseURL` carries the *base* URL of the OpenAI-compatible endpoint
 *   (path without the trailing `/chat/completions`). The adapter
 *   auto-appends `/chat/completions`. Defaults to
 *   `https://api.openai.com/v1` when unset.
 * - The append is done through the WHATWG `URL` class so that
 *   query strings supplied by the operator (e.g. Azure's
 *   `?api-version=YYYY-MM-DD`) are preserved.
 *
 * Error mapping (driven by the injected mapper):
 * - HTTP 429 → `mapper.rateLimit`
 * - HTTP 5xx → `mapper.unavailable`
 * - HTTP 401 / 403 → `mapper.quota`
 * - `AbortError` (deadline lapsed) → `mapper.timeout`
 * - Network `TypeError` / other → `mapper.unavailable`
 *
 * Empty-response contract:
 * - When the response body contains no assistant `content` (e.g. the
 *   model returned only `tool_calls` / refusal / nothing), this helper
 *   returns `""`. Callers whose port contract allows empty output
 *   (`OCRProvider`, `PDFExtractor`) consume the empty string directly.
 *   `OpenAILLMProvider` re-introduces the empty-string check at its own
 *   boundary — see the mirrored note in `messagesClient.ts` of the
 *   Anthropic adapter (Issue #113 ADR-002).
 */

export type OpenAISharedConfig = Readonly<{
  /** OpenAI-compatible API key. Sourced from env or DB ciphertext. */
  apiKey: string;
  /** Chat Completions model id (e.g. `gpt-4o-mini`). */
  model: string;
  /**
   * Base URL for the OpenAI-compatible endpoint. The adapter appends
   * `/chat/completions` and preserves any existing query string.
   * Examples:
   * - OpenAI: `https://api.openai.com/v1` (also the default)
   * - Groq: `https://api.groq.com/openai/v1`
   * - Azure: `https://<resource>.openai.azure.com/openai/deployments/<deployment>?api-version=YYYY-MM-DD`
   */
  baseURL?: string;
  /**
   * Wall-clock budget per request in milliseconds. Translates to an
   * `AbortController.signal`; the caller's `mapper.timeout` is invoked
   * when the deadline lapses.
   */
  timeoutMs?: number;
  /** Maximum tokens the model may produce per call. */
  maxTokens?: number;
}>;

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_TIMEOUT_MS = 60_000;
// Conservative default for LLM-mode callers. OCR / PDF intentionally override
// via their constructor (16384) — text-heavy outputs would otherwise truncate.
export const DEFAULT_MAX_TOKENS = 4096;

export type OpenAITextBlock = Readonly<{ type: "text"; text: string }>;
export type OpenAIImageBlock = Readonly<{
  type: "image_url";
  image_url: Readonly<{ url: string }>;
}>;
export type OpenAIFileBlock = Readonly<{
  type: "file";
  file: Readonly<{ filename: string; file_data: string }>;
}>;

export type OpenAIContentBlock =
  | OpenAITextBlock
  | OpenAIImageBlock
  | OpenAIFileBlock;

export type OpenAIErrorMapper = Readonly<{
  rateLimit(message: string, cause?: unknown): Error;
  unavailable(message: string, cause?: unknown): Error;
  timeout(message: string, cause?: unknown): Error;
  quota(message: string, cause?: unknown): Error;
}>;

type OpenAIChoice = Readonly<{
  message?: Readonly<{ content?: unknown }>;
}>;

type OpenAIChatResponse = Readonly<{
  choices?: readonly OpenAIChoice[];
}>;

type OpenAIErrorBody = Readonly<{
  error?: Readonly<{ type?: string; message?: string; code?: string }>;
}>;

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function isTransientNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Builds the full Chat Completions URL by appending `/chat/completions`
 * to the base URL while preserving any query string (e.g. Azure's
 * `?api-version=YYYY-MM-DD`). See ADR-001 of Issue #101.
 */
export function buildChatCompletionsURL(baseURL: string | undefined): string {
  const u = new URL(baseURL ?? DEFAULT_BASE_URL);
  u.pathname = `${u.pathname.replace(/\/$/, "")}/chat/completions`;
  return u.toString();
}

function extractTextContent(body: OpenAIChatResponse): string {
  const choice = body.choices?.[0];
  if (!choice?.message) return "";
  const content = choice.message.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    // Some OpenAI-compatible servers return `content` as an array of
    // content blocks (e.g. `{ type: "text", text }`). Concatenate all
    // text blocks and ignore everything else.
    const parts: string[] = [];
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        parts.push((block as { text: string }).text);
      }
    }
    return parts.join("\n").trim();
  }
  return "";
}

/**
 * Encodes an `ArrayBuffer` to a base64 string using a Latin-1
 * (`String.fromCharCode` / `btoa`) round-trip in 8KB chunks. Workers /
 * V8 cap variadic spread at roughly 65535 args, so 8KB is comfortably
 * inside the limit. The intermediate string is Latin-1 (1 byte = 1
 * char), NOT UTF-8 — this is the standard `btoa` pre-encoding path.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8 * 1024;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * POSTs a single Chat Completions request and returns the extracted
 * assistant text. The provided `mapper` decides which concrete `Error`
 * subclass is thrown for each failure category, letting OCR / PDF /
 * LLM callers stay inside their respective port contracts.
 *
 * The joined text content is `String.trim()`-ed before return.
 */
export async function callOpenAIMessages(
  config: OpenAISharedConfig,
  system: string,
  content: readonly OpenAIContentBlock[],
  mapper: OpenAIErrorMapper,
): Promise<string> {
  const endpoint = buildChatCompletionsURL(config.baseURL);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: system,
          },
          {
            role: "user",
            content,
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    if (isAbortError(cause)) {
      throw mapper.timeout(
        `OpenAI request aborted after ${timeoutMs}ms`,
        cause,
      );
    }
    if (isTransientNetworkError(cause)) {
      throw mapper.unavailable(
        "Network error while calling OpenAI Chat Completions API",
        cause,
      );
    }
    throw mapper.unavailable(
      "Unexpected error while calling OpenAI Chat Completions API",
      cause,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    await throwForStatus(response, mapper);
  }

  let body: OpenAIChatResponse;
  try {
    body = (await response.json()) as OpenAIChatResponse;
  } catch (cause) {
    throw mapper.unavailable("OpenAI response was not valid JSON", cause);
  }
  return extractTextContent(body);
}

async function throwForStatus(
  response: Response,
  mapper: OpenAIErrorMapper,
): Promise<never> {
  const status = response.status;
  let detail = "";
  let errorType: string | undefined;
  try {
    const body = (await response.json()) as OpenAIErrorBody;
    if (body.error) {
      errorType = body.error.type;
      detail = body.error.message ?? "";
    }
  } catch {
    // Body might be plain text or empty; fall back to status text below.
  }
  const detailSuffix = detail.length > 0 ? `: ${detail}` : "";
  if (status === 429) {
    // OpenAI returns 429 for both rate-limit and quota-exhaustion
    // (`insufficient_quota`) cases. Surface the quota-exhausted variant
    // as a non-retryable failure; everything else stays retryable.
    if (errorType === "insufficient_quota" || /quota/i.test(detail)) {
      throw mapper.quota(`OpenAI quota exhausted (HTTP 429)${detailSuffix}`);
    }
    throw mapper.rateLimit(`OpenAI rate limit (HTTP 429)${detailSuffix}`);
  }
  if (status === 401 || status === 403) {
    throw mapper.quota(
      `OpenAI auth / quota failure (HTTP ${status})${detailSuffix}`,
    );
  }
  if (status >= 500 && status < 600) {
    throw mapper.unavailable(
      `OpenAI upstream failure (HTTP ${status})${detailSuffix}`,
    );
  }
  throw mapper.unavailable(
    `OpenAI request failed (HTTP ${status})${detailSuffix}`,
  );
}
