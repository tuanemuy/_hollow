import {
  maskSecrets,
  sanitizeErrorReason,
  toReasonString,
} from "@/core/application/llm/sanitizeErrorReason";

/**
 * Liveness probe for Deepgram's transcription configuration. Rather than
 * sending real audio to `/v1/listen` (which requires a payload and burns
 * cost), this probe confirms the api key by hitting
 * `GET https://api.deepgram.com/v1/projects` and reporting `ok: true` on any
 * 2xx. Unlike OpenAI's `GET /models/{model}`, Deepgram has no equivalent
 * model-retrieve endpoint, so the probe confirms only "key valid" — an
 * unknown model name is not caught here and surfaces as a 4xx on the first
 * real transcribe (ADR-001). The probe still requires a non-empty model for
 * UX symmetry with the OpenAI probe.
 *
 * The probe never throws — the admin UI surfaces the discriminated result.
 */
export type DeepgramSpeechPingResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

export type DeepgramSpeechPingConfig = Readonly<{
  apiKey: string;
  model: string;
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 10_000;
/** Authentication-only probe endpoint (no model existence check). */
const PROJECTS_ENDPOINT = "https://api.deepgram.com/v1/projects";

type DeepgramErrorBody = Readonly<{
  err_code?: unknown;
  err_msg?: unknown;
  message?: unknown;
  reason?: unknown;
}>;

/**
 * True when `error` is an `AbortError` from the timeout `AbortController`.
 * Checks `DOMException` and `Error` separately: on Cloudflare Workers
 * (workerd) `fetch` aborts reject with a `DOMException` that does NOT extend
 * `Error`, so an `instanceof Error`-only guard would surface the timeout as a
 * generic transport reason in the admin connection-test UI. Symmetric with
 * the OpenAI speech ping's `isAbortError`.
 */
function isAbortError(error: unknown): boolean {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return true;
  }
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

export async function pingDeepgramSpeech(
  config: DeepgramSpeechPingConfig,
): Promise<DeepgramSpeechPingResult> {
  const apiKey = config.apiKey.trim();
  if (apiKey.length === 0) {
    return { ok: false, reason: "API key is empty" };
  }
  // Deepgram's probe does not use the model (it hits `/v1/projects`), but an
  // empty model is rejected here for UX symmetry with the OpenAI probe — so a
  // half-configured form fails the same way regardless of provider.
  if (config.model.length === 0) {
    return { ok: false, reason: "model is empty" };
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(PROJECTS_ENDPOINT, {
      method: "GET",
      signal: controller.signal,
      headers: {
        authorization: `Token ${apiKey}`,
      },
    });
    if (response.ok) {
      return { ok: true };
    }
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as DeepgramErrorBody;
      const message =
        typeof body.err_msg === "string"
          ? body.err_msg
          : typeof body.message === "string"
            ? body.message
            : typeof body.reason === "string"
              ? body.reason
              : undefined;
      if (typeof message === "string" && message.length > 0) {
        // Probe-path non-2xx detail uses `maskSecrets` only (no category
        // normalization), symmetric with the OpenAI speech ping. Masking
        // still applies, so no key leaks.
        detail = maskSecrets(message);
      }
    } catch {
      // Body might be plain text or empty; fall through to status-only detail.
    }
    return { ok: false, reason: detail };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, reason: `Request timed out after ${timeoutMs}ms` };
    }
    return { ok: false, reason: toReasonString(sanitizeErrorReason(error)) };
  } finally {
    clearTimeout(timer);
  }
}
