import { describe, expect, it } from "vitest";
import { AnthropicLLMProvider } from "@/core/adapters/anthropic/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/anthropic/pdfExtractor";
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

describe("createLLMProvider", () => {
  it("returns AnthropicLLMProvider when provider is 'anthropic'", () => {
    const provider = createLLMProvider(ANTHROPIC_CONFIG);
    expect(provider).toBeInstanceOf(AnthropicLLMProvider);
  });

  it("throws an Error for unsupported providers", () => {
    expect(() =>
      createLLMProvider({ ...ANTHROPIC_CONFIG, provider: "openai" }),
    ).toThrow(/Unsupported LLM provider: openai/);
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

  it("throws an Error for unsupported providers", () => {
    expect(() =>
      createOCRProvider({ ...ANTHROPIC_CONFIG, provider: "gemini" }),
    ).toThrow(/Unsupported OCR provider: gemini/);
  });
});

describe("createPDFExtractor", () => {
  it("returns AnthropicPDFExtractor when provider is 'anthropic'", () => {
    const extractor = createPDFExtractor(ANTHROPIC_CONFIG);
    expect(extractor).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("throws an Error for unsupported providers", () => {
    expect(() =>
      createPDFExtractor({ ...ANTHROPIC_CONFIG, provider: "azure-openai" }),
    ).toThrow(/Unsupported PDF provider: azure-openai/);
  });
});
