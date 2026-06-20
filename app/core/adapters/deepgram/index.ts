// Type-only import: no value import, so the
// `speech/registry → deepgram/index → speech/registry` graph stays acyclic
// (same shape as `openai/index.ts`).
import type { SpeechAdapter } from "../speech/registry";
import { pingDeepgramSpeech } from "./speechConnectionPing";
import { DeepgramSpeechRecognitionProvider } from "./speechRecognitionProvider";

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
