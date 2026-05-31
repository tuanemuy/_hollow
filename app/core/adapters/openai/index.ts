import type { ProviderAdapter, ProviderAdapterConfig } from "../llm/registry";
import { pingOpenAI } from "./connectionPing";
import { OpenAILLMProvider } from "./llmProvider";
import type { OpenAISharedConfig } from "./messagesClient";
import { OpenAIOCRProvider } from "./ocrProvider";
import { OpenAIPDFExtractor } from "./pdfExtractor";

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
