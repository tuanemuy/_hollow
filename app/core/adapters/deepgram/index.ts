// Type-only import: no value import, so the
// `speech/registry → deepgram/index → speech/registry` graph stays acyclic
// (same shape as `openai/index.ts`).
import type { SpeechAdapter } from "../speech/registry";
import { pingDeepgramSpeech } from "./speechConnectionPing";
import { DeepgramSpeechRecognitionProvider } from "./speechRecognitionProvider";
import { DeepgramWorkersAiSpeechRecognitionProvider } from "./workersAiSpeechRecognitionProvider";

/**
 * Deepgram speech-to-text adapter. Symmetric with `openaiSpeechAdapter`:
 * `create` builds the transcription provider; `ping` is the lightweight
 * `GET /v1/projects` auth probe. The speech config has no `baseURL`, so the
 * fixed Deepgram endpoint is always used.
 */
export const deepgramSpeechAdapter = {
  create: (cfg) =>
    new DeepgramSpeechRecognitionProvider({
      apiKey: cfg.apiKey,
      model: cfg.model,
    }),
  ping: async (cfg, apiKey, timeoutMs) => {
    const result = await pingDeepgramSpeech({
      apiKey,
      model: cfg.model,
      timeoutMs,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.reason };
  },
} satisfies SpeechAdapter;

/**
 * Cloudflare Workers AI Deepgram (`@cf/deepgram/nova-3`) speech-to-text adapter
 * (Issue #788). Reads the injected `deps.ai` binding instead of an API key
 * (ADR-004); `create` ignores `cfg.apiKey` entirely. The `ping` probe confirms
 * only that the `env.AI` binding is wired — it never calls `run()` (no real
 * audio, no billing; ADR-005). REST adapters ignore `deps`, so this is the only
 * `SpeechAdapter` that reads it.
 */
export const deepgramWorkersAiSpeechAdapter = {
  create: (cfg, deps) =>
    new DeepgramWorkersAiSpeechRecognitionProvider({
      model: cfg.model,
      ...(deps?.ai !== undefined ? { ai: deps.ai } : {}),
    }),
  ping: async (_cfg, _apiKey, _timeoutMs, deps) =>
    deps?.ai !== undefined
      ? { ok: true }
      : { ok: false, error: "AI binding is not configured" },
} satisfies SpeechAdapter;
