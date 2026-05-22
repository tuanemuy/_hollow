import {
  buildChatCompletionsURL,
  type OpenAISharedConfig,
} from "./messagesClient";

/**
 * Liveness probe for an OpenAI-compatible Chat Completions endpoint.
 *
 * Sends the smallest credentialed request the provider accepts (a
 * 1-token `max_tokens` echo) and reports `ok: true` on any 2xx, or
 * `ok: false` with a human-readable `reason` on every other outcome
 * (4xx, 5xx, timeout, transport). The probe never throws — admin UI
 * surfaces the discriminated result as-is.
 *
 * URL composition follows ADR-001 of Issue #101: `baseURL` is the base
 * (default `https://api.openai.com/v1`) and `/chat/completions` is
 * auto-appended through the WHATWG `URL` class so Azure-style
 * `?api-version=...` query strings survive intact.
 */
export type OpenAIPingResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

const DEFAULT_TIMEOUT_MS = 10_000;

type OpenAIErrorBody = Readonly<{
  error?: Readonly<{ type?: string; message?: string; code?: string }>;
}>;

export async function pingOpenAI(
  config: OpenAISharedConfig,
): Promise<OpenAIPingResult> {
  const apiKey = config.apiKey.trim();
  if (apiKey.length === 0) {
    return { ok: false, reason: "API key is empty" };
  }
  if (config.model.length === 0) {
    return { ok: false, reason: "model is empty" };
  }

  const endpoint = buildChatCompletionsURL(config.baseURL);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (response.ok) {
      return { ok: true };
    }
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as OpenAIErrorBody;
      const message = body.error?.message;
      const type = body.error?.type;
      if (typeof message === "string" && message.length > 0) {
        detail = type ? `${type}: ${message}` : message;
      }
    } catch {
      // Body might be plain text or empty; fall through to HTTP-status-only detail.
    }
    return { ok: false, reason: detail };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        reason: `Request timed out after ${timeoutMs}ms`,
      };
    }
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
