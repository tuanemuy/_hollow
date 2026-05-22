import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pingAnthropic } from "@/core/adapters/anthropic/connectionPing";
import { pingGemini } from "@/core/adapters/gemini/connectionPing";
import { pingOpenAI } from "@/core/adapters/openai/connectionPing";
import type { LLMConfig } from "@/core/domain/adminSettings/valueObject";
import { HttpLLMConnectionTester } from "../llmConnectionTester";

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

// `HttpLLMConnectionTester` only reads `cfg.provider`, `cfg.model`, and
// `cfg.baseURL`; the rest of `LLMConfig` is irrelevant for dispatch.
// Cast through `unknown` to avoid constructing the full value-object.
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

describe("HttpLLMConnectionTester", () => {
  beforeEach(() => {
    mockedPingAnthropic.mockReset();
    mockedPingOpenAI.mockReset();
    mockedPingGemini.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("rejects a non-finite timeoutMs", () => {
      expect(() => new HttpLLMConnectionTester(Number.NaN)).toThrow(
        /timeoutMs must be a positive finite number/,
      );
      expect(
        () => new HttpLLMConnectionTester(Number.POSITIVE_INFINITY),
      ).toThrow(/timeoutMs must be a positive finite number/);
    });

    it("rejects a non-positive timeoutMs", () => {
      expect(() => new HttpLLMConnectionTester(0)).toThrow(
        /timeoutMs must be a positive finite number/,
      );
      expect(() => new HttpLLMConnectionTester(-1)).toThrow(
        /timeoutMs must be a positive finite number/,
      );
    });

    it("accepts a positive finite timeoutMs", () => {
      expect(() => new HttpLLMConnectionTester(1)).not.toThrow();
      expect(() => new HttpLLMConnectionTester(60_000)).not.toThrow();
    });
  });

  describe("empty apiKey guard", () => {
    it("returns { ok: false, latencyMs: 0, error } and does not dispatch when apiKey is empty after trim", async () => {
      const tester = new HttpLLMConnectionTester(5000);
      const result = await tester.ping(cfg({ provider: "anthropic" }), "   ");
      expect(result).toEqual({
        ok: false,
        latencyMs: 0,
        error: "API key is empty",
      });
      expect(mockedPingAnthropic).not.toHaveBeenCalled();
      expect(mockedPingOpenAI).not.toHaveBeenCalled();
      expect(mockedPingGemini).not.toHaveBeenCalled();
    });
  });

  describe("provider dispatch", () => {
    it("dispatches to pingAnthropic for provider=anthropic and passes the trimmed apiKey + timeoutMs", async () => {
      mockedPingAnthropic.mockResolvedValueOnce({ ok: true });

      const tester = new HttpLLMConnectionTester(7000);
      const config = cfg({ provider: "anthropic", model: "claude-3-5-haiku" });
      const result = await tester.ping(config, "  sk-ant  ");

      expect(mockedPingAnthropic).toHaveBeenCalledTimes(1);
      expect(mockedPingAnthropic).toHaveBeenCalledWith(config, "sk-ant", 7000);
      expect(mockedPingOpenAI).not.toHaveBeenCalled();
      expect(mockedPingGemini).not.toHaveBeenCalled();

      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.latencyMs)).toBe(true);
    });

    it("dispatches to pingOpenAI for provider=openai and omits baseURL when cfg.baseURL is null", async () => {
      mockedPingOpenAI.mockResolvedValueOnce({ ok: true });

      const tester = new HttpLLMConnectionTester(8000);
      const config = cfg({
        provider: "openai",
        model: "gpt-4o-mini",
        baseURL: null,
      });
      await tester.ping(config, "sk-openai");

      expect(mockedPingOpenAI).toHaveBeenCalledTimes(1);
      const arg = mockedPingOpenAI.mock.calls[0]?.[0];
      expect(arg).toEqual({
        apiKey: "sk-openai",
        model: "gpt-4o-mini",
        timeoutMs: 8000,
      });
      // baseURL must NOT be present when cfg.baseURL is null — leaving
      // it off lets the OpenAI client fall back to the default endpoint.
      expect(arg).not.toHaveProperty("baseURL");
    });

    it("dispatches to pingOpenAI and forwards baseURL when cfg.baseURL is non-null", async () => {
      mockedPingOpenAI.mockResolvedValueOnce({ ok: true });

      const tester = new HttpLLMConnectionTester(8000);
      const config = cfg({
        provider: "openai",
        model: "gpt-4o-mini",
        baseURL: "https://api.groq.com/openai/v1",
      });
      await tester.ping(config, "sk-openai");

      expect(mockedPingOpenAI).toHaveBeenCalledTimes(1);
      const arg = mockedPingOpenAI.mock.calls[0]?.[0];
      expect(arg).toEqual({
        apiKey: "sk-openai",
        model: "gpt-4o-mini",
        baseURL: "https://api.groq.com/openai/v1",
        timeoutMs: 8000,
      });
    });

    it("dispatches to pingGemini for provider=gemini", async () => {
      mockedPingGemini.mockResolvedValueOnce({ ok: true });

      const tester = new HttpLLMConnectionTester(9000);
      const config = cfg({ provider: "gemini", model: "gemini-1.5-flash" });
      await tester.ping(config, "AIza-test");

      expect(mockedPingGemini).toHaveBeenCalledTimes(1);
      expect(mockedPingGemini).toHaveBeenCalledWith({
        apiKey: "AIza-test",
        model: "gemini-1.5-flash",
        timeoutMs: 9000,
      });
    });
  });

  describe("result envelope normalization", () => {
    it("normalizes pingOpenAI { ok: false, reason } into { ok: false, latencyMs, error }", async () => {
      mockedPingOpenAI.mockResolvedValueOnce({
        ok: false,
        reason: "invalid_api_key: bad key",
      });

      const tester = new HttpLLMConnectionTester(5000);
      const result = await tester.ping(
        cfg({ provider: "openai" }),
        "sk-openai",
      );
      expect(result.ok).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect((result as { error: string }).error).toBe(
        "invalid_api_key: bad key",
      );
    });

    it("normalizes pingGemini { ok: false, reason } into { ok: false, latencyMs, error }", async () => {
      mockedPingGemini.mockResolvedValueOnce({
        ok: false,
        reason: "UNAUTHENTICATED: API key invalid",
      });

      const tester = new HttpLLMConnectionTester(5000);
      const result = await tester.ping(cfg({ provider: "gemini" }), "AIza-bad");
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toBe(
        "UNAUTHENTICATED: API key invalid",
      );
    });

    it("passes pingAnthropic { ok: false, error } through with the same error string", async () => {
      mockedPingAnthropic.mockResolvedValueOnce({
        ok: false,
        error: "authentication_error: invalid x-api-key",
      });

      const tester = new HttpLLMConnectionTester(5000);
      const result = await tester.ping(
        cfg({ provider: "anthropic" }),
        "sk-ant-bad",
      );
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toBe(
        "authentication_error: invalid x-api-key",
      );
    });

    it("omits the `error` field when an ok: false result carries no message", async () => {
      // pingAnthropic's contract allows `error` to be absent. The
      // dispatcher should not synthesize one when the probe didn't.
      mockedPingAnthropic.mockResolvedValueOnce({ ok: false });

      const tester = new HttpLLMConnectionTester(5000);
      const result = await tester.ping(
        cfg({ provider: "anthropic" }),
        "sk-ant",
      );
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("error");
    });

    it("returns latencyMs >= 0 and Number.isFinite for a successful ping", async () => {
      mockedPingAnthropic.mockResolvedValueOnce({ ok: true });

      const tester = new HttpLLMConnectionTester(5000);
      const result = await tester.ping(
        cfg({ provider: "anthropic" }),
        "sk-ant",
      );
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.latencyMs)).toBe(true);
    });
  });
});
