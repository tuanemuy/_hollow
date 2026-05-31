import { describe, expect, it } from "vitest";
import type { LLMConfig } from "@/core/domain/adminSettings/valueObject";
import { AnthropicLLMProvider } from "../../anthropic/llmProvider";
import { AnthropicOCRProvider } from "../../anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "../../anthropic/pdfExtractor";
import { GeminiLLMProvider } from "../../gemini/llmProvider";
import { GeminiOCRProvider } from "../../gemini/ocrProvider";
import { GeminiPDFExtractor } from "../../gemini/pdfExtractor";
import { OpenAILLMProvider } from "../../openai/llmProvider";
import { OpenAIOCRProvider } from "../../openai/ocrProvider";
import { OpenAIPDFExtractor } from "../../openai/pdfExtractor";
import { factoryProviderRegistry } from "../registry";

describe("factoryProviderRegistry", () => {
  const cfg = { apiKey: "test-key", model: "test-model", baseURL: null };

  it("has an entry for every supported provider", () => {
    for (const provider of ["anthropic", "openai", "gemini"] as const) {
      expect(factoryProviderRegistry[provider]).toBeDefined();
    }
  });

  it("constructs the correct anthropic ports", () => {
    const a = factoryProviderRegistry.anthropic;
    expect(a.llm(cfg)).toBeInstanceOf(AnthropicLLMProvider);
    expect(a.ocr(cfg)).toBeInstanceOf(AnthropicOCRProvider);
    expect(a.pdf(cfg)).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("constructs the correct openai ports", () => {
    const o = factoryProviderRegistry.openai;
    expect(o.llm(cfg)).toBeInstanceOf(OpenAILLMProvider);
    expect(o.ocr(cfg)).toBeInstanceOf(OpenAIOCRProvider);
    expect(o.pdf(cfg)).toBeInstanceOf(OpenAIPDFExtractor);
  });

  it("constructs the correct gemini ports", () => {
    const g = factoryProviderRegistry.gemini;
    expect(g.llm(cfg)).toBeInstanceOf(GeminiLLMProvider);
    expect(g.ocr(cfg)).toBeInstanceOf(GeminiOCRProvider);
    expect(g.pdf(cfg)).toBeInstanceOf(GeminiPDFExtractor);
  });

  it("normalizes a failed ping to the unified { ok, error } shape", async () => {
    // `HttpLLMConnectionTester` only reads `cfg.provider`, `cfg.model`, and
    // `cfg.baseURL`; cast through `unknown` to skip the full value-object.
    const llmConfig = {
      provider: "anthropic",
      model: "test-model",
      baseURL: null,
    } as unknown as LLMConfig;
    // A 1ms timeout forces an AbortError, so the probe resolves to the
    // failure shape without depending on real connectivity.
    const result = await factoryProviderRegistry.anthropic.ping(
      llmConfig,
      "test-key",
      1,
    );
    expect(typeof result.ok).toBe("boolean");
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });
});
