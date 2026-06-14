import type { ProviderAdapter, ProviderAdapterConfig } from "../llm/registry";
// Type-only dependency on the speech registry (mirrors the `import type
// { ProviderAdapter }` above). No value import, so the
// `speech/registry → openai/index → speech/registry` graph stays acyclic.
import type { SpeechAdapter } from "../speech/registry";
import { pingOpenAI } from "./connectionPing";
import { OpenAILLMProvider } from "./llmProvider";
import type { OpenAISharedConfig } from "./messagesClient";
import { OpenAIOCRProvider } from "./ocrProvider";
import { OpenAIPDFExtractor } from "./pdfExtractor";
import { pingOpenAISpeech } from "./speechConnectionPing";
import { OpenAISpeechRecognitionProvider } from "./speechRecognitionProvider";

/**
 * Normalize the registry config into an {@link OpenAISharedConfig}. A null or
 * empty `baseURL` is omitted entirely (rather than set to `undefined`) so the
 * field stays absent under `exactOptionalPropertyTypes`.
 */
function toOpenAIConfig(c: ProviderAdapterConfig): OpenAISharedConfig {
  const base = { apiKey: c.apiKey, model: c.model };
  if (c.baseURL !== null && c.baseURL !== "") {
    return { ...base, baseURL: c.baseURL };
  }
  return base;
}

/**
 * OpenAI-compatible provider adapter.
 *
 * Dependency direction: barrels import the `ProviderAdapter` type from the
 * registry (`import type`, no value cycle); the registry imports this value.
 */
export const openaiAdapter = {
  llm: (c) => new OpenAILLMProvider(toOpenAIConfig(c)),
  ocr: (c) => new OpenAIOCRProvider(toOpenAIConfig(c)),
  pdf: (c) => new OpenAIPDFExtractor(toOpenAIConfig(c)),
  ping: async (cfg, apiKey, timeoutMs) => {
    const result = await pingOpenAI(
      cfg.baseURL !== null
        ? { apiKey, model: cfg.model, baseURL: cfg.baseURL, timeoutMs }
        : { apiKey, model: cfg.model, timeoutMs },
    );
    return result.ok ? { ok: true } : { ok: false, error: result.reason };
  },
} satisfies ProviderAdapter;

/**
 * OpenAI speech-to-text adapter (Issue #701). Speech has its own VO /
 * registry distinct from the LLM/OCR/PDF triple (ADR-002), so this is a
 * separate `SpeechAdapter` value rather than a member of `openaiAdapter`.
 * `create` builds the transcription provider; `ping` is the lightweight
 * `GET /models/{model}` probe (ADR-006). The speech config has no
 * `baseURL` (ADR-003), so the OpenAI default endpoint is always used.
 *
 * Dependency direction: this barrel imports only the `SpeechAdapter` *type*
 * from `speech/registry`; the registry imports this *value*. No value cycle.
 */
export const openaiSpeechAdapter = {
  create: (cfg) =>
    new OpenAISpeechRecognitionProvider({
      apiKey: cfg.apiKey,
      model: cfg.model,
    }),
  ping: async (cfg, apiKey, timeoutMs) => {
    const result = await pingOpenAISpeech({
      apiKey,
      model: cfg.model,
      timeoutMs,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.reason };
  },
} satisfies SpeechAdapter;
