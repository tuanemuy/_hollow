import type { GeminiSharedConfig } from "./messagesClient";

// Wall-clock budget for the probe. The dispatcher in
// `app/core/application/di/llmConnectionTester.ts` (Wave 2C / ADR-003)
// will eventually orchestrate this with a shared timeout; for now the
// helper carries its own conservative default so it can be called
// independently from tests.
const DEFAULT_TIMEOUT_MS = 10_000;

const DEFAULT_ENDPOINT_HOST = "https://generativelanguage.googleapis.com";
const DEFAULT_API_VERSION_PATH = "v1beta";

type GeminiErrorBody = Readonly<{
  error?: { status?: string; message?: string; code?: number };
}>;

export type GeminiPingResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

function buildEndpoint(config: GeminiSharedConfig): string {
  if (config.endpoint !== undefined && config.endpoint.length > 0) {
    return config.endpoint;
  }
  return `${DEFAULT_ENDPOINT_HOST}/${DEFAULT_API_VERSION_PATH}/models/${config.model}:generateContent`;
}

/**
 * Liveness probe for the Google Gemini `generateContent` API.
 *
 * Issues the smallest credentialed request the provider accepts (a
 * one-token output budget over the literal text "ping") and reports
 * `ok: false` with a `reason` string on any non-2xx / transport
 * failure. Per ADR-002 the API key is sent via the `x-goog-api-key`
 * HTTP header — never as a `?key=` query parameter — so the URL stays
 * safe to log.
 *
 * The probe never throws: every transport / provider failure is folded
 * into the result struct so the admin "test connection" UI and the
 * application-layer dispatcher (`HttpLLMConnectionTester`,
 * Issue #101 ADR-003) can render the outcome uniformly.
 */
export async function pingGemini(
  config: GeminiSharedConfig,
): Promise<GeminiPingResult> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (config.apiKey.trim().length === 0) {
    return { ok: false, reason: "API key is empty" };
  }
  const endpoint = buildEndpoint(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "ping" }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1,
        },
      }),
    });
    if (response.ok) {
      return { ok: true };
    }
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as GeminiErrorBody;
      const message = body.error?.message;
      const status = body.error?.status;
      if (typeof message === "string" && message.length > 0) {
        detail =
          typeof status === "string" && status.length > 0
            ? `${status}: ${message}`
            : message;
      }
    } catch {
      // Body might be plain text or empty; fall through to HTTP-status detail.
    }
    return { ok: false, reason: detail };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: `Request timed out after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
