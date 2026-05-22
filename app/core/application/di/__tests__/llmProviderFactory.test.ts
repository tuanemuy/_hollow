import { describe, expect, it } from "vitest";
import { AnthropicLLMProvider } from "@/core/adapters/anthropic/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/anthropic/pdfExtractor";
import { GeminiLLMProvider } from "@/core/adapters/gemini/llmProvider";
import { GeminiOCRProvider } from "@/core/adapters/gemini/ocrProvider";
import { GeminiPDFExtractor } from "@/core/adapters/gemini/pdfExtractor";
import { OpenAILLMProvider } from "@/core/adapters/openai/llmProvider";
import { OpenAIOCRProvider } from "@/core/adapters/openai/ocrProvider";
import { OpenAIPDFExtractor } from "@/core/adapters/openai/pdfExtractor";
import {
  createLLMProvider,
  createOCRProvider,
  createPDFExtractor,
} from "../llmProviderFactory";

const ANTHROPIC_CONFIG = {
  provider: "anthropic",
  apiKey: "sk-ant-test",
  model: "claude-3-5-sonnet-latest",
} as const;

const OPENAI_CONFIG = {
  provider: "openai",
  apiKey: "sk-openai-test",
  model: "gpt-4o-mini",
} as const;

const OPENAI_CONFIG_WITH_BASE_URL = {
  ...OPENAI_CONFIG,
  baseURL: "https://api.groq.com/openai/v1",
} as const;

const GEMINI_CONFIG = {
  provider: "gemini",
  apiKey: "AIza-test",
  model: "gemini-1.5-flash",
} as const;

describe("createLLMProvider", () => {
  it("returns AnthropicLLMProvider when provider is 'anthropic'", () => {
    const provider = createLLMProvider(ANTHROPIC_CONFIG);
    expect(provider).toBeInstanceOf(AnthropicLLMProvider);
  });

  it("returns OpenAILLMProvider when provider is 'openai'", () => {
    const provider = createLLMProvider(OPENAI_CONFIG);
    expect(provider).toBeInstanceOf(OpenAILLMProvider);
  });

  it("returns OpenAILLMProvider when provider is 'openai' with a custom baseURL", () => {
    const provider = createLLMProvider(OPENAI_CONFIG_WITH_BASE_URL);
    expect(provider).toBeInstanceOf(OpenAILLMProvider);
  });

  it("returns GeminiLLMProvider when provider is 'gemini'", () => {
    const provider = createLLMProvider(GEMINI_CONFIG);
    expect(provider).toBeInstanceOf(GeminiLLMProvider);
  });

  it("throws an Error for unsupported providers", () => {
    expect(() =>
      createLLMProvider({ ...ANTHROPIC_CONFIG, provider: "azure-openai" }),
    ).toThrow(/Unsupported LLM provider: azure-openai/);
  });

  it("throws an Error for an empty provider string", () => {
    expect(() =>
      createLLMProvider({ ...ANTHROPIC_CONFIG, provider: "" }),
    ).toThrow(/Unsupported LLM provider:/);
  });
});

describe("createOCRProvider", () => {
  it("returns AnthropicOCRProvider when provider is 'anthropic'", () => {
    const provider = createOCRProvider(ANTHROPIC_CONFIG);
    expect(provider).toBeInstanceOf(AnthropicOCRProvider);
  });

  it("returns OpenAIOCRProvider when provider is 'openai'", () => {
    const provider = createOCRProvider(OPENAI_CONFIG);
    expect(provider).toBeInstanceOf(OpenAIOCRProvider);
  });

  it("returns GeminiOCRProvider when provider is 'gemini'", () => {
    const provider = createOCRProvider(GEMINI_CONFIG);
    expect(provider).toBeInstanceOf(GeminiOCRProvider);
  });

  it("throws an Error for unsupported providers", () => {
    expect(() =>
      createOCRProvider({ ...ANTHROPIC_CONFIG, provider: "vertex" }),
    ).toThrow(/Unsupported OCR provider: vertex/);
  });
});

describe("createPDFExtractor", () => {
  it("returns AnthropicPDFExtractor when provider is 'anthropic'", () => {
    const extractor = createPDFExtractor(ANTHROPIC_CONFIG);
    expect(extractor).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("returns OpenAIPDFExtractor when provider is 'openai'", () => {
    const extractor = createPDFExtractor(OPENAI_CONFIG);
    expect(extractor).toBeInstanceOf(OpenAIPDFExtractor);
  });

  it("returns GeminiPDFExtractor when provider is 'gemini'", () => {
    const extractor = createPDFExtractor(GEMINI_CONFIG);
    expect(extractor).toBeInstanceOf(GeminiPDFExtractor);
  });

  it("throws an Error for unsupported providers", () => {
    expect(() =>
      createPDFExtractor({ ...ANTHROPIC_CONFIG, provider: "azure-openai" }),
    ).toThrow(/Unsupported PDF provider: azure-openai/);
  });
});
