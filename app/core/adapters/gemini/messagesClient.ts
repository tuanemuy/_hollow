import { maskSecrets } from "@/core/application/llm/sanitizeErrorReason";

/**
 * Shared HTTP client for Google Gemini `generateContent` API.
 *
 * Used by `GeminiLLMProvider`, `GeminiOCRProvider`, and
 * `GeminiPDFExtractor` to avoid duplicating fetch + timeout + status
 * mapping logic. Each caller supplies a {@link GeminiErrorMapper} so
 * port-specific error classes (`OCRFailureError`, `PDFParseError`, the
 * `LLM*` family) can be thrown without leaking provider-native error
 * types upward.
 *
 * Endpoint shape:
 * - `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
 *
 * Authentication (Issue #101 / ADR-002):
 * - Always via the `x-goog-api-key` HTTP header. The API key is **never**
 *   put on the URL as a `?key=` query parameter — that would risk
 *   leaking the key into fetch / proxy / error-reporting logs.
 *
 * Error mapping (driven by the injected mapper):
 * - HTTP 429 → `mapper.rateLimit`
 * - HTTP 5xx → `mapper.unavailable`
 * - HTTP 401 / 403 → `mapper.quota`
 * - `AbortError` (deadline lapsed) → `mapper.timeout`
 * - Network `TypeError` / other → `mapper.unavailable`
 *
 * Empty-response contract:
 * - When the response contains no `text` parts (e.g. the model returned
 *   only function calls / safety-blocked output), this helper returns
 *   `""`. Callers whose port contract allows empty output (`OCRProvider`,
 *   `PDFExtractor`) consume the empty string directly. The LLM-mode
 *   caller (`GeminiLLMProvider`) re-introduces an empty-string guard at
 *   its own boundary.
 */

export type GeminiSharedConfig = Readonly<{
  /** Google AI Studio API key. Sourced from env or DB ciphertext. */
  apiKey: string;
  /** Gemini model id (e.g. `gemini-2.5-flash`, `gemini-1.5-pro`). */
  model: string;
  /** Optional override for the Gemini API host (used only by tests). */
  endpoint?: string;
  /**
   * Wall-clock budget per request in milliseconds. Translates to an
   * `AbortController.signal`; the caller's `mapper.timeout` is invoked
   * when the deadline lapses.
   */
  timeoutMs?: number;
  /** Maximum tokens the model may produce per call. */
  maxTokens?: number;
}>;

export const DEFAULT_ENDPOINT_HOST =
  "https://generativelanguage.googleapis.com";
export const DEFAULT_API_VERSION_PATH = "v1beta";
export const DEFAULT_TIMEOUT_MS = 60_000;
// Conservative default for LLM-mode callers. OCR / PDF intentionally override
// via their constructor (16384) — text-heavy outputs would otherwise truncate.
export const DEFAULT_MAX_TOKENS = 4096;

export type GeminiContentPart =
  | Readonly<{ text: string }>
  | Readonly<{
      inlineData: Readonly<{
        mimeType: string;
        data: string;
      }>;
    }>;

export type GeminiErrorMapper = Readonly<{
  rateLimit(message: string, cause?: unknown): Error;
  unavailable(message: string, cause?: unknown): Error;
  timeout(message: string, cause?: unknown): Error;
  quota(message: string, cause?: unknown): Error;
}>;

type GeminiResponsePart = Readonly<{ text?: unknown }>;

type GeminiCandidate = Readonly<{
  content?: Readonly<{ parts?: readonly GeminiResponsePart[] }>;
}>;

type GeminiGenerateResponse = Readonly<{
  candidates?: readonly GeminiCandidate[];
}>;

type GeminiErrorBody = Readonly<{
  error?: Readonly<{ status?: string; message?: string; code?: number }>;
}>;

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function isTransientNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function extractTextContent(body: GeminiGenerateResponse): string {
  const candidate = body.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!parts || parts.length === 0) return "";
  const collected: string[] = [];
  for (const part of parts) {
    if (typeof part.text === "string") {
      collected.push(part.text);
    }
  }
  return collected.join("\n").trim();
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

function buildEndpoint(config: GeminiSharedConfig): string {
  if (config.endpoint !== undefined && config.endpoint.length > 0) {
    return config.endpoint;
  }
  return `${DEFAULT_ENDPOINT_HOST}/${DEFAULT_API_VERSION_PATH}/models/${config.model}:generateContent`;
}

/**
 * Optional per-call knobs for {@link callGeminiGenerate}. LLM-mode
 * callers may pass `responseMimeType: "application/json"` to force the
 * model to emit a JSON document at the API level. OCR / PDF callers
 * omit this entirely so their request bodies stay unchanged.
 */
export type GeminiCallOptions = Readonly<{
  responseMimeType?: string;
}>;

/**
 * POSTs a single `generateContent` request and returns the extracted
 * text. The provided `mapper` decides which concrete `Error` subclass is
 * thrown for each failure category, letting OCR / PDF / LLM callers stay
 * inside their respective port contracts.
 *
 * The joined text content is `String.trim()`-ed before return —
 * leading/trailing whitespace and newlines are dropped, matching the
 * Anthropic adapter's behaviour.
 */
export async function callGeminiGenerate(
  config: GeminiSharedConfig,
  system: string,
  parts: readonly GeminiContentPart[],
  mapper: GeminiErrorMapper,
  options?: GeminiCallOptions,
): Promise<string> {
  const endpoint = buildEndpoint(config);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: maxTokens,
  };
  if (options?.responseMimeType !== undefined) {
    generationConfig.responseMimeType = options.responseMimeType;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        systemInstruction: {
          parts: [{ text: system }],
        },
        generationConfig,
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    if (isAbortError(cause)) {
      throw mapper.timeout(
        `Gemini request aborted after ${timeoutMs}ms`,
        cause,
      );
    }
    if (isTransientNetworkError(cause)) {
      throw mapper.unavailable(
        "Network error while calling Gemini generateContent API",
        cause,
      );
    }
    throw mapper.unavailable(
      "Unexpected error while calling Gemini generateContent API",
      cause,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    await throwForStatus(response, mapper);
  }

  let body: GeminiGenerateResponse;
  try {
    body = (await response.json()) as GeminiGenerateResponse;
  } catch (cause) {
    throw mapper.unavailable("Gemini response was not valid JSON", cause);
  }
  return extractTextContent(body);
}

async function throwForStatus(
  response: Response,
  mapper: GeminiErrorMapper,
): Promise<never> {
  const status = response.status;
  let detail = "";
  try {
    const body = (await response.json()) as GeminiErrorBody;
    if (body.error) {
      detail = body.error.message ?? "";
    }
  } catch {
    // Body might be plain text or empty; fall back to status text below.
  }
  const detailSuffix = detail.length > 0 ? `: ${maskSecrets(detail)}` : "";
  if (status === 429) {
    throw mapper.rateLimit(`Gemini rate limit (HTTP 429)${detailSuffix}`);
  }
  if (status === 401 || status === 403) {
    throw mapper.quota(
      `Gemini authentication / quota failure (HTTP ${status})${detailSuffix}`,
    );
  }
  if (status >= 500 && status < 600) {
    throw mapper.unavailable(
      `Gemini upstream failure (HTTP ${status})${detailSuffix}`,
    );
  }
  throw mapper.unavailable(
    `Gemini request failed (HTTP ${status})${detailSuffix}`,
  );
}
