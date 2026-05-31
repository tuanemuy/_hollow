import type { ProviderAdapter } from "../llm/registry";
import { pingAnthropic } from "./connectionPing";
import { AnthropicLLMProvider } from "./llmProvider";
import { AnthropicOCRProvider } from "./ocrProvider";
import { AnthropicPDFExtractor } from "./pdfExtractor";

/**
 * Anthropic provider adapter. The `baseURL` field of the registry config is
 * intentionally ignored — Anthropic does not support a custom base URL.
 *
 * Dependency direction: barrels import the `ProviderAdapter` type from the
 * registry (`import type`, no value cycle); the registry imports this value.
 */
export const anthropicAdapter = {
  llm: (c) => new AnthropicLLMProvider({ apiKey: c.apiKey, model: c.model }),
  ocr: (c) => new AnthropicOCRProvider({ apiKey: c.apiKey, model: c.model }),
  pdf: (c) => new AnthropicPDFExtractor({ apiKey: c.apiKey, model: c.model }),
  // `pingAnthropic` already returns the unified `{ ok, error? }` shape, so it
  // is forwarded as-is. Reconstructing the object would surface `error` as
  // `string | undefined` and break `exactOptionalPropertyTypes`.
  ping: (cfg, apiKey, timeoutMs) => pingAnthropic(cfg, apiKey, timeoutMs),
} satisfies ProviderAdapter;
