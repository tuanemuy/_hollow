import { AnthropicLLMProvider } from "@/core/adapters/anthropic/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/anthropic/pdfExtractor";
import { GeminiLLMProvider } from "@/core/adapters/gemini/llmProvider";
import { GeminiOCRProvider } from "@/core/adapters/gemini/ocrProvider";
import { GeminiPDFExtractor } from "@/core/adapters/gemini/pdfExtractor";
import { OpenAILLMProvider } from "@/core/adapters/openai/llmProvider";
import { OpenAIOCRProvider } from "@/core/adapters/openai/ocrProvider";
import { OpenAIPDFExtractor } from "@/core/adapters/openai/pdfExtractor";
import type { LLMProvider } from "@/core/domain/ingestion/ports/llmProvider";
import type { OCRProvider } from "@/core/domain/ingestion/ports/ocrProvider";
import type { PDFExtractor } from "@/core/domain/ingestion/ports/pdfExtractor";

/**
 * Provider-agnostic factory config for the LLM / OCR / PDF ports.
 *
 * `provider` is intentionally typed as `string` (not the domain-side
 * `LLMProvider` literal union) because the value originates from the
 * `ADMIN_LLM_PROVIDER` env or DB row. Runtime validation inside each
 * factory surfaces typos and unsupported providers as a thrown `Error`
 * at the earliest call site rather than silently falling back.
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
  baseURL?: string;
}>;

/**
 * Build the request-time {@link LLMProvider} for the given provider id.
 * Throws when `config.provider` is not one of the supported providers
 * so misconfiguration (env typo, unsupported value) is caught at DI
 * wiring rather than at first use.
 *
 * Supported providers: `anthropic`, `openai`, `gemini`. New providers
 * are added by extending the `switch` together with the matching
 * adapter under `app/core/adapters/<provider>/`.
 */
export function createLLMProvider(config: LLMFactoryConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicLLMProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    case "openai":
      return new OpenAILLMProvider(buildOpenAIConfig(config));
    case "gemini":
      return new GeminiLLMProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * Build an OpenAI shared config from {@link LLMFactoryConfig}, omitting
 * `baseURL` entirely when undefined. `exactOptionalPropertyTypes` makes
 * `{ baseURL: undefined }` distinct from "field absent", and the
 * adapter constructor declares `baseURL?: string` (not `string | undefined`).
 */
function buildOpenAIConfig(
  config: LLMFactoryConfig,
): Readonly<{ apiKey: string; model: string; baseURL?: string }> {
  return config.baseURL !== undefined
    ? {
        apiKey: config.apiKey,
        model: config.model,
        baseURL: config.baseURL,
      }
    : {
        apiKey: config.apiKey,
        model: config.model,
      };
}

/**
 * Build the request-time {@link OCRProvider} for the given provider id.
 * Supported providers: `anthropic`, `openai`, `gemini`. Each ships
 * with its own adapter under `app/core/adapters/<provider>/`.
 */
export function createOCRProvider(config: LLMFactoryConfig): OCRProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicOCRProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    case "openai":
      return new OpenAIOCRProvider(buildOpenAIConfig(config));
    case "gemini":
      return new GeminiOCRProvider({
        apiKey: config.apiKey,
        model: config.model,
      });
    default:
      throw new Error(`Unsupported OCR provider: ${config.provider}`);
  }
}

/**
 * Build the request-time {@link PDFExtractor} for the given provider id.
 * Supported providers: `anthropic`, `openai`, `gemini`. Each ships
 * with its own adapter under `app/core/adapters/<provider>/`.
 *
 * The OpenAI adapter only handles PDFs on `gpt-4o`-family models; the
 * admin UI surfaces an inline help message when the OpenAI provider is
 * selected so operators pick a supporting model.
 */
export function createPDFExtractor(config: LLMFactoryConfig): PDFExtractor {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicPDFExtractor({
        apiKey: config.apiKey,
        model: config.model,
      });
    case "openai":
      return new OpenAIPDFExtractor(buildOpenAIConfig(config));
    case "gemini":
      return new GeminiPDFExtractor({
        apiKey: config.apiKey,
        model: config.model,
      });
    default:
      throw new Error(`Unsupported PDF provider: ${config.provider}`);
  }
}
