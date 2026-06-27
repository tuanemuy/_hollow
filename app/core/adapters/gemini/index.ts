import type { ProviderAdapter } from "../llm/registry";
// Type-only import: no value import, so the
// `speech/registry → gemini/index → speech/registry` graph stays acyclic
// (same shape as `openai/index.ts` / `deepgram/index.ts`).
import type { SpeechAdapter } from "../speech/registry";
import { pingGemini } from "./connectionPing";
import { GeminiLLMProvider } from "./llmProvider";
import { GeminiOCRProvider } from "./ocrProvider";
import { GeminiPDFExtractor } from "./pdfExtractor";
import { pingGeminiSpeech } from "./speechConnectionPing";
import { GeminiSpeechRecognitionProvider } from "./speechRecognitionProvider";

/**
 * Gemini provider adapter. The `baseURL` field of the registry config is
 * intentionally ignored — Gemini does not support a custom base URL.
 *
 * Dependency direction: barrels import the `ProviderAdapter` type from the
 * registry (`import type`, no value cycle); the registry imports this value.
 */
export const geminiAdapter = {
  llm: (c) => new GeminiLLMProvider({ apiKey: c.apiKey, model: c.model }),
  ocr: (c) => new GeminiOCRProvider({ apiKey: c.apiKey, model: c.model }),
  pdf: (c) => new GeminiPDFExtractor({ apiKey: c.apiKey, model: c.model }),
  ping: async (cfg, apiKey, timeoutMs) => {
    const result = await pingGemini({ apiKey, model: cfg.model, timeoutMs });
    return result.ok ? { ok: true } : { ok: false, error: result.reason };
  },
} satisfies ProviderAdapter;

/**
 * Gemini speech-to-text adapter. Symmetric with `openaiSpeechAdapter` /
 * `deepgramSpeechAdapter`: `create` builds the transcription provider (audio as
 * `generateContent` `inlineData`); `ping` reuses the shared `pingGemini` probe.
 */
export const geminiSpeechAdapter = {
  create: (cfg) =>
    new GeminiSpeechRecognitionProvider({
      apiKey: cfg.apiKey,
      model: cfg.model,
    }),
  ping: async (cfg, apiKey, timeoutMs) => {
    const result = await pingGeminiSpeech({
      apiKey,
      model: cfg.model,
      timeoutMs,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.reason };
  },
} satisfies SpeechAdapter;
