import type { ProviderAdapter } from "../llm/registry";
import { pingGemini } from "./connectionPing";
import { GeminiLLMProvider } from "./llmProvider";
import { GeminiOCRProvider } from "./ocrProvider";
import { GeminiPDFExtractor } from "./pdfExtractor";

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
