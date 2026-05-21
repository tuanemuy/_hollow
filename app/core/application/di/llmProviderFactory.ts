import { AnthropicLLMProvider } from "@/core/adapters/anthropic/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/anthropic/pdfExtractor";
import type { LLMProvider } from "@/core/domain/ingestion/ports/llmProvider";
import type { OCRProvider } from "@/core/domain/ingestion/ports/ocrProvider";
import type { PDFExtractor } from "@/core/domain/ingestion/ports/pdfExtractor";

/**
 * Provider-agnostic factory config for the LLM / OCR / PDF ports.
 *
 * `provider` is intentionally typed as `string` (not the domain-side
 * `LLMProvider` literal union) because the value originates from the
 * `ADMIN_LLM_PROVIDER` env. Runtime validation inside each factory
 * surfaces typos and unsupported providers as a thrown `Error` at the
 * earliest call site rather than silently falling back. See ADR-007 of
 * Issue #122 for why we deferred the compile-time exhaustive check
 * until a second real provider lands.
 */
export type LLMFactoryConfig = Readonly<{
  provider: string;
  apiKey: string;
  model: string;
}>;

/**
 * Build the request-time {@link LLMProvider} for the given provider id.
 * Throws when `config.provider` is not one of the supported providers
 * so misconfiguration (env typo, unsupported value) is caught at DI
 * wiring rather than at first use.
 */
export function createLLMProvider(config: LLMFactoryConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicLLMProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * Build the request-time {@link OCRProvider} for the given provider id.
 * Anthropic is currently the only backend; additional providers extend
 * the `switch` and ship with their own adapter under
 * `app/core/adapters/<provider>/`.
 */
export function createOCRProvider(config: LLMFactoryConfig): OCRProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicOCRProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * Build the request-time {@link PDFExtractor} for the given provider id.
 * Anthropic is currently the only backend; additional providers extend
 * the `switch` and ship with their own adapter under
 * `app/core/adapters/<provider>/`.
 */
export function createPDFExtractor(config: LLMFactoryConfig): PDFExtractor {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicPDFExtractor({
        apiKey: config.apiKey,
        model: config.model,
      });
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
