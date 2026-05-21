/**
 * Shared HTTP client for Anthropic Messages API.
 *
 * Used by `AnthropicOCRProvider` and `AnthropicPDFExtractor` to avoid
 * duplicating fetch + timeout + status mapping logic. Each caller
 * supplies an {@link AnthropicErrorMapper} so port-specific error
 * classes (`OCRFailureError`, `PDFParseError`) can be thrown without
 * leaking provider-native error types upward.
 *
 * Error mapping (driven by the injected mapper):
 * - HTTP 429 → `mapper.rateLimit`
 * - HTTP 5xx → `mapper.unavailable`
 * - HTTP 403 with quota / billing wording → `mapper.quota`
 * - `AbortError` (deadline lapsed) → `mapper.timeout`
 * - Network `TypeError` / other → `mapper.unavailable`
 *
 * Empty-response contract:
 * - When the response body contains no `text` content block (e.g. the
 *   model returned only tool_use / refusal / nothing), this helper
 *   returns `""`. Callers whose port contract allows empty output
 *   (`OCRProvider`, `PDFExtractor`) consume the empty string directly.
 *   If a future caller (e.g. `AnthropicLLMProvider`) needs an error in
 *   that case it must re-introduce the empty-string check at its own
 *   boundary — see ADR-002 of Issue #113.
 *
 * Existing `AnthropicLLMProvider` is intentionally NOT migrated to this
 * helper in the same PR (Issue #113 / ADR-002). The duplication is
 * temporary and tracked for a follow-up refactor.
 */

export type AnthropicSharedConfig = Readonly<{
  /** Anthropic API key. Sourced from env or DB ciphertext. */
  apiKey: string;
  /** Messages-API model id (e.g. `claude-3-5-sonnet-latest`). */
  model: string;
  /** Optional override for the Messages API endpoint. */
  endpoint?: string;
  /** Anthropic API version header. Defaults to {@link DEFAULT_API_VERSION}. */
  apiVersion?: string;
  /**
   * Wall-clock budget per request in milliseconds. Translates to an
   * `AbortController.signal`; the caller's `mapper.timeout` is invoked
   * when the deadline lapses.
   */
  timeoutMs?: number;
  /** Maximum tokens the model may produce per call. */
  maxTokens?: number;
}>;

export const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const DEFAULT_API_VERSION = "2023-06-01";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_TOKENS = 4096;

export type AnthropicContentBlock =
  | Readonly<{ type: "text"; text: string }>
  | Readonly<{
      type: "image";
      source: Readonly<{
        type: "base64";
        media_type: string;
        data: string;
      }>;
    }>
  | Readonly<{
      type: "document";
      source: Readonly<{
        type: "base64";
        media_type: string;
        data: string;
      }>;
    }>;

export type AnthropicErrorMapper = Readonly<{
  rateLimit(message: string, cause?: unknown): Error;
  unavailable(message: string, cause?: unknown): Error;
  timeout(message: string, cause?: unknown): Error;
  quota(message: string, cause?: unknown): Error;
}>;

type AnthropicResponseBlock =
  | Readonly<{ type: "text"; text: string }>
  | Readonly<{ type: string }>;

type AnthropicMessageResponse = Readonly<{
  content?: readonly AnthropicResponseBlock[];
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
  return error instanceof TypeError;
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
 * POSTs a single Messages API request and returns the extracted text.
 * The provided `mapper` decides which concrete `Error` subclass is
 * thrown for each failure category, letting OCR / PDF / future callers
 * stay inside their respective port contracts.
 */
export async function callAnthropicMessages(
  config: AnthropicSharedConfig,
  system: string,
  content: readonly AnthropicContentBlock[],
  mapper: AnthropicErrorMapper,
): Promise<string> {
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
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
        "x-api-key": config.apiKey,
        "anthropic-version": apiVersion,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        system,
        messages: [
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
        `Anthropic request aborted after ${timeoutMs}ms`,
        cause,
      );
    }
    if (isTransientNetworkError(cause)) {
      throw mapper.unavailable(
        "Network error while calling Anthropic Messages API",
        cause,
      );
    }
    throw mapper.unavailable(
      "Unexpected error while calling Anthropic Messages API",
      cause,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    await throwForStatus(response, mapper);
  }

  let body: AnthropicMessageResponse;
  try {
    body = (await response.json()) as AnthropicMessageResponse;
  } catch (cause) {
    throw mapper.unavailable("Anthropic response was not valid JSON", cause);
  }
  return extractTextContent(body);
}

async function throwForStatus(
  response: Response,
  mapper: AnthropicErrorMapper,
): Promise<never> {
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
    throw mapper.rateLimit(`Anthropic rate limit (HTTP 429)${detailSuffix}`);
  }
  if (status === 403) {
    if (
      errorType === "permission_error" ||
      /quota|credit|billing/i.test(detail)
    ) {
      throw mapper.quota(
        `Anthropic quota / billing failure (HTTP 403)${detailSuffix}`,
      );
    }
    throw mapper.unavailable(
      `Anthropic permission failure (HTTP 403)${detailSuffix}`,
    );
  }
  if (status >= 500 && status < 600) {
    throw mapper.unavailable(
      `Anthropic upstream failure (HTTP ${status})${detailSuffix}`,
    );
  }
  throw mapper.unavailable(
    `Anthropic request failed (HTTP ${status})${detailSuffix}`,
  );
}
