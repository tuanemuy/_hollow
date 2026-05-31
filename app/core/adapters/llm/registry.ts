import type {
  LLMConfig,
  LLMProvider as LLMProviderId,
} from "@/core/domain/adminSettings/valueObject";
import type { LLMProvider as LLMProviderPort } from "@/core/domain/ingestion/ports/llmProvider";
import type { OCRProvider } from "@/core/domain/ingestion/ports/ocrProvider";
import type { PDFExtractor } from "@/core/domain/ingestion/ports/pdfExtractor";
// Dependency direction: the registry imports the concrete adapter *values* from
// each provider barrel; the barrels import only the `ProviderAdapter` *type*
// from here (`import type`). This keeps the value graph acyclic.
import { anthropicAdapter } from "../anthropic";
import { geminiAdapter } from "../gemini";
import { openaiAdapter } from "../openai";

/**
 * Normalized configuration handed to every provider adapter factory. Providers
 * that do not support a custom base URL ignore the `baseURL` field.
 */
export type ProviderAdapterConfig = Readonly<{
  apiKey: string;
  model: string;
  baseURL: string | null;
}>;

/**
 * Unified ping outcome. The `error` field is present only on failure.
 */
export type ProviderPingResult = { ok: boolean; error?: string };

/**
 * A single provider's contribution to the registry: factories for each port
 * plus a connectivity ping. Each provider barrel exports one of these.
 */
export type ProviderAdapter = Readonly<{
  llm: (c: ProviderAdapterConfig) => LLMProviderPort;
  ocr: (c: ProviderAdapterConfig) => OCRProvider;
  pdf: (c: ProviderAdapterConfig) => PDFExtractor;
  ping: (
    cfg: LLMConfig,
    apiKey: string,
    timeoutMs: number,
  ) => Promise<ProviderPingResult>;
}>;

/**
 * Single source of truth mapping each {@link LLMProviderId} to its adapter. The
 * `Record<LLMProviderId, ProviderAdapter>` annotation makes provider coverage a
 * compile-time guarantee: adding a member to `LLM_PROVIDERS` without a matching
 * entry here is a type error.
 */
export const factoryProviderRegistry: Record<LLMProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
};
