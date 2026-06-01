import { beforeEach, describe, expect, it, vi } from "vitest";
import { pingAnthropic } from "@/core/adapters/anthropic/connectionPing";
import { pingGemini } from "@/core/adapters/gemini/connectionPing";
import { pingOpenAI } from "@/core/adapters/openai/connectionPing";
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
import { factoryProviderRegistry, lookupProviderAdapter } from "../registry";

// Mock each provider's connectionPing module so registry pings never touch the
// network. The barrels import `pingXxx` at module-load time, so mocking the
// whole module makes the mock effective through the barrel indirection.
vi.mock("@/core/adapters/anthropic/connectionPing", () => ({
  pingAnthropic: vi.fn(),
}));
vi.mock("@/core/adapters/openai/connectionPing", () => ({
  pingOpenAI: vi.fn(),
}));
vi.mock("@/core/adapters/gemini/connectionPing", () => ({
  pingGemini: vi.fn(),
}));

const mockedPingAnthropic = vi.mocked(pingAnthropic);
const mockedPingOpenAI = vi.mocked(pingOpenAI);
const mockedPingGemini = vi.mocked(pingGemini);

// `ProviderAdapter.ping` only reads `cfg.model` and `cfg.baseURL`; cast through
// `unknown` to skip constructing the full value-object.
function cfg(overrides: {
  provider: "anthropic" | "openai" | "gemini";
  model?: string;
  baseURL?: string | null;
}): LLMConfig {
  return {
    provider: overrides.provider,
    model: overrides.model ?? "test-model",
    baseURL: overrides.baseURL ?? null,
  } as unknown as LLMConfig;
}

const adapterConfig = {
  apiKey: "test-key",
  model: "test-model",
  baseURL: null,
};

describe("factoryProviderRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("anthropic", () => {
    it("constructs the correct anthropic ports", () => {
      const a = factoryProviderRegistry.anthropic;
      expect(a.llm(adapterConfig)).toBeInstanceOf(AnthropicLLMProvider);
      expect(a.ocr(adapterConfig)).toBeInstanceOf(AnthropicOCRProvider);
      expect(a.pdf(adapterConfig)).toBeInstanceOf(AnthropicPDFExtractor);
    });

    it("forwards (cfg, apiKey, timeoutMs) to pingAnthropic unchanged", async () => {
      mockedPingAnthropic.mockResolvedValue({ ok: true });
      const llmConfig = cfg({ provider: "anthropic", model: "claude-x" });

      await factoryProviderRegistry.anthropic.ping(llmConfig, "test-key", 5000);

      expect(mockedPingAnthropic).toHaveBeenCalledWith(
        llmConfig,
        "test-key",
        5000,
      );
    });

    it("passes a failing ping result through unchanged", async () => {
      mockedPingAnthropic.mockResolvedValue({ ok: false, error: "boom" });

      const result = await factoryProviderRegistry.anthropic.ping(
        cfg({ provider: "anthropic" }),
        "test-key",
        5000,
      );

      expect(result).toEqual({ ok: false, error: "boom" });
    });

    it("returns { ok: true } with no error field on success", async () => {
      mockedPingAnthropic.mockResolvedValue({ ok: true });

      const result = await factoryProviderRegistry.anthropic.ping(
        cfg({ provider: "anthropic" }),
        "test-key",
        5000,
      );

      expect(result).toEqual({ ok: true });
      expect(result).not.toHaveProperty("error");
    });
  });

  describe("openai", () => {
    it("constructs the correct openai ports", () => {
      const o = factoryProviderRegistry.openai;
      expect(o.llm(adapterConfig)).toBeInstanceOf(OpenAILLMProvider);
      expect(o.ocr(adapterConfig)).toBeInstanceOf(OpenAIOCRProvider);
      expect(o.pdf(adapterConfig)).toBeInstanceOf(OpenAIPDFExtractor);
    });

    it("omits baseURL when cfg.baseURL is null", async () => {
      mockedPingOpenAI.mockResolvedValue({ ok: true });

      await factoryProviderRegistry.openai.ping(
        cfg({ provider: "openai", model: "gpt-4o", baseURL: null }),
        "test-key",
        5000,
      );

      expect(mockedPingOpenAI).toHaveBeenCalledWith({
        apiKey: "test-key",
        model: "gpt-4o",
        timeoutMs: 5000,
      });
      const callArg = mockedPingOpenAI.mock.calls[0]?.[0];
      expect(callArg).not.toHaveProperty("baseURL");
    });

    it("passes baseURL through when cfg.baseURL is non-null", async () => {
      mockedPingOpenAI.mockResolvedValue({ ok: true });

      await factoryProviderRegistry.openai.ping(
        cfg({
          provider: "openai",
          model: "gpt-4o",
          baseURL: "https://proxy.example.com/v1",
        }),
        "test-key",
        5000,
      );

      expect(mockedPingOpenAI).toHaveBeenCalledWith({
        apiKey: "test-key",
        model: "gpt-4o",
        baseURL: "https://proxy.example.com/v1",
        timeoutMs: 5000,
      });
    });

    it("converts a failing { ok: false, reason } to { ok: false, error }", async () => {
      mockedPingOpenAI.mockResolvedValue({ ok: false, reason: "rate limited" });

      const result = await factoryProviderRegistry.openai.ping(
        cfg({ provider: "openai" }),
        "test-key",
        5000,
      );

      expect(result).toEqual({ ok: false, error: "rate limited" });
    });

    it("returns { ok: true } with no error field on success", async () => {
      mockedPingOpenAI.mockResolvedValue({ ok: true });

      const result = await factoryProviderRegistry.openai.ping(
        cfg({ provider: "openai" }),
        "test-key",
        5000,
      );

      expect(result).toEqual({ ok: true });
      expect(result).not.toHaveProperty("error");
    });
  });

  describe("gemini", () => {
    it("constructs the correct gemini ports", () => {
      const g = factoryProviderRegistry.gemini;
      expect(g.llm(adapterConfig)).toBeInstanceOf(GeminiLLMProvider);
      expect(g.ocr(adapterConfig)).toBeInstanceOf(GeminiOCRProvider);
      expect(g.pdf(adapterConfig)).toBeInstanceOf(GeminiPDFExtractor);
    });

    it("calls pingGemini with { apiKey, model, timeoutMs } and never baseURL", async () => {
      mockedPingGemini.mockResolvedValue({ ok: true });

      await factoryProviderRegistry.gemini.ping(
        cfg({
          provider: "gemini",
          model: "gemini-1.5-flash",
          // A baseURL on the LLMConfig must be ignored for Gemini.
          baseURL: "https://should-be-ignored.example.com",
        }),
        "test-key",
        5000,
      );

      expect(mockedPingGemini).toHaveBeenCalledWith({
        apiKey: "test-key",
        model: "gemini-1.5-flash",
        timeoutMs: 5000,
      });
      const callArg = mockedPingGemini.mock.calls[0]?.[0];
      expect(callArg).not.toHaveProperty("baseURL");
    });

    it("converts a failing { ok: false, reason } to { ok: false, error }", async () => {
      mockedPingGemini.mockResolvedValue({
        ok: false,
        reason: "quota exceeded",
      });

      const result = await factoryProviderRegistry.gemini.ping(
        cfg({ provider: "gemini" }),
        "test-key",
        5000,
      );

      expect(result).toEqual({ ok: false, error: "quota exceeded" });
    });

    it("returns { ok: true } with no error field on success", async () => {
      mockedPingGemini.mockResolvedValue({ ok: true });

      const result = await factoryProviderRegistry.gemini.ping(
        cfg({ provider: "gemini" }),
        "test-key",
        5000,
      );

      expect(result).toEqual({ ok: true });
      expect(result).not.toHaveProperty("error");
    });
  });
});

describe("lookupProviderAdapter", () => {
  it("returns the registered adapter for known provider names", () => {
    expect(lookupProviderAdapter("anthropic")).toBe(
      factoryProviderRegistry.anthropic,
    );
    expect(lookupProviderAdapter("openai")).toBe(
      factoryProviderRegistry.openai,
    );
    expect(lookupProviderAdapter("gemini")).toBe(
      factoryProviderRegistry.gemini,
    );
  });

  it("returns undefined for an unregistered provider name", () => {
    expect(lookupProviderAdapter("typo")).toBeUndefined();
  });
});
