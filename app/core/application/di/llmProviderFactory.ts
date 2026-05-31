import { lookupProviderAdapter } from "@/core/adapters/llm/registry";
import type { LLMProvider } from "@/core/domain/ingestion/ports/llmProvider";
import type { OCRProvider } from "@/core/domain/ingestion/ports/ocrProvider";
import type { PDFExtractor } from "@/core/domain/ingestion/ports/pdfExtractor";

/**
 * Provider-agnostic factory config for the LLM / OCR / PDF ports.
 *
 * `provider` is intentionally typed as `string` (not the domain-side
 * `LLMProvider` literal union) because the value originates from the
 * `ADMIN_LLM_PROVIDER` env or DB row. The registry lookup surfaces typos
 * and unsupported providers as a thrown `Error` at the earliest call site
 * rather than silently falling back.
 *
 * `baseURL` is meaningful only for the `openai` case (Issue #101
 * ADR-001) — it selects between OpenAI proper, Azure OpenAI, Groq,
 * vLLM, and other OpenAI-compatible endpoints. Anthropic and Gemini
 * ignore the field; the slot exists at the factory boundary only so
 * the wiring code can pass it through uniformly without per-provider
 * branching. The provider × baseURL invariant is enforced by
 * `LLMConfig.create` upstream, so callers do not have to defend
 * against a stray `baseURL` reaching the Anthropic / Gemini cases.
 */
export type LLMFactoryConfig = Readonly<{
  provider: string;
  apiKey: string;
  model: string;
  baseURL?: string | null;
}>;

/**
 * Build the request-time {@link LLMProvider} for the given provider id.
 * Throws when `config.provider` is not registered in
 * `factoryProviderRegistry` so misconfiguration (env typo, unsupported
 * value) is caught at DI wiring rather than at first use.
 *
 * New providers are added by exporting a `ProviderAdapter` from
 * `app/core/adapters/<provider>/index.ts` and registering it in
 * `factoryProviderRegistry`; no change here is needed.
 */
export function createLLMProvider(config: LLMFactoryConfig): LLMProvider {
  const adapter = lookupProviderAdapter(config.provider);
  if (adapter === undefined) {
    throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
  return adapter.llm({
    apiKey: config.apiKey,
    model: config.model,
    baseURL: config.baseURL ?? null,
  });
}

/**
 * Build the request-time {@link OCRProvider} for the given provider id.
 * New providers are added by registering a `ProviderAdapter` in
 * `factoryProviderRegistry` (see {@link createLLMProvider}).
 */
export function createOCRProvider(config: LLMFactoryConfig): OCRProvider {
  const adapter = lookupProviderAdapter(config.provider);
  if (adapter === undefined) {
    throw new Error(`Unsupported OCR provider: ${config.provider}`);
  }
  return adapter.ocr({
    apiKey: config.apiKey,
    model: config.model,
    baseURL: config.baseURL ?? null,
  });
}

/**
 * Build the request-time {@link PDFExtractor} for the given provider id.
 * New providers are added by registering a `ProviderAdapter` in
 * `factoryProviderRegistry` (see {@link createLLMProvider}).
 *
 * The OpenAI adapter only handles PDFs on `gpt-4o`-family models; the
 * admin UI surfaces an inline help message when the OpenAI provider is
 * selected so operators pick a supporting model.
 */
export function createPDFExtractor(config: LLMFactoryConfig): PDFExtractor {
  const adapter = lookupProviderAdapter(config.provider);
  if (adapter === undefined) {
    throw new Error(`Unsupported PDF provider: ${config.provider}`);
  }
  return adapter.pdf({
    apiKey: config.apiKey,
    model: config.model,
    baseURL: config.baseURL ?? null,
  });
}
