import {
  maskSecrets,
  sanitizeErrorReason,
  toReasonString,
} from "@/core/application/llm/sanitizeErrorReason";
import { DEFAULT_BASE_URL } from "./messagesClient";

/**
 * Liveness probe for OpenAI's transcription configuration (Issue #701
 * ADR-006). Rather than sending real audio to `/audio/transcriptions`
 * (which requires a payload and burns cost), this probe confirms the
 * api key + model by hitting `GET {baseURL}/models/{model}` and reporting
 * `ok: true` on any 2xx. The model-retrieve endpoint authenticates with the
 * same Bearer token and 404s for an unknown model, so a 2xx confirms both
 * "key valid" and "model exists" — the AC-1 acceptance boundary.
 *
 * The probe never throws — the admin UI surfaces the discriminated result.
 */
export type OpenAISpeechPingResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

export type OpenAISpeechPingConfig = Readonly<{
  apiKey: string;
  model: string;
  baseURL?: string;
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 10_000;

type OpenAIErrorBody = Readonly<{
  error?: Readonly<{ type?: string; message?: string; code?: string }>;
}>;

function buildModelURL(baseURL: string | undefined, model: string): string {
  const u = new URL(baseURL ?? DEFAULT_BASE_URL);
  u.pathname = `${u.pathname.replace(/\/$/, "")}/models/${encodeURIComponent(model)}`;
  return u.toString();
}

export async function pingOpenAISpeech(
  config: OpenAISpeechPingConfig,
): Promise<OpenAISpeechPingResult> {
  const apiKey = config.apiKey.trim();
  if (apiKey.length === 0) {
    return { ok: false, reason: "API key is empty" };
  }
  if (config.model.length === 0) {
    return { ok: false, reason: "model is empty" };
  }

  const endpoint = buildModelURL(config.baseURL, config.model);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
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
        const masked = maskSecrets(message);
        detail = type ? `${type}: ${masked}` : masked;
      }
    } catch {
      // Body might be plain text or empty; fall through to status-only detail.
    }
    return { ok: false, reason: detail };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: `Request timed out after ${timeoutMs}ms` };
    }
    return { ok: false, reason: toReasonString(sanitizeErrorReason(error)) };
  } finally {
    clearTimeout(timer);
  }
}
