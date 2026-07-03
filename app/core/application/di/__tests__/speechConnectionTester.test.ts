import type { Ai } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SpeechAdapter,
  SpeechAdapterDeps,
  SpeechPingResult,
} from "@/core/adapters/speech/registry";
import { lookupSpeechAdapter } from "@/core/adapters/speech/registry";
import type { SpeechRecognitionConfig } from "@/core/domain/adminSettings/valueObject";
import { HttpSpeechConnectionTester } from "../speechConnectionTester";

// The tester only threads the binding through as an opaque `deps.ai`; a bare
// object stand-in is sufficient for dispatch assertions.
const FAKE_AI = {} as unknown as Ai;

vi.mock("@/core/adapters/speech/registry", () => ({
  lookupSpeechAdapter: vi.fn(),
}));

const mockedLookup = vi.mocked(lookupSpeechAdapter);

// `HttpSpeechConnectionTester` only reads `cfg.provider` and `cfg.model` for
// dispatch; the rest of the value object is irrelevant. Cast through unknown
// to avoid constructing the full VO.
function cfg(overrides: {
  provider?: string;
  model?: string;
}): SpeechRecognitionConfig {
  return {
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-4o-transcribe",
  } as unknown as SpeechRecognitionConfig;
}

function adapter(
  ping: (
    cfg: SpeechRecognitionConfig,
    apiKey: string,
    timeoutMs: number,
    deps?: SpeechAdapterDeps,
  ) => Promise<SpeechPingResult>,
): SpeechAdapter {
  return {
    create: vi.fn() as unknown as SpeechAdapter["create"],
    ping,
  };
}

describe("HttpSpeechConnectionTester", () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("rejects a non-finite timeoutMs", () => {
      expect(() => new HttpSpeechConnectionTester(Number.NaN)).toThrow(
        /timeoutMs must be a positive finite number/,
      );
      expect(
        () => new HttpSpeechConnectionTester(Number.POSITIVE_INFINITY),
      ).toThrow(/timeoutMs must be a positive finite number/);
    });

    it("rejects a non-positive timeoutMs", () => {
      expect(() => new HttpSpeechConnectionTester(0)).toThrow(
        /timeoutMs must be a positive finite number/,
      );
      expect(() => new HttpSpeechConnectionTester(-1)).toThrow(
        /timeoutMs must be a positive finite number/,
      );
    });

    it("accepts a positive finite timeoutMs", () => {
      expect(() => new HttpSpeechConnectionTester(1)).not.toThrow();
      expect(() => new HttpSpeechConnectionTester(60_000)).not.toThrow();
    });
  });

  describe("empty apiKey guard", () => {
    it("returns { ok: false, latencyMs: 0, error } and does not dispatch when apiKey is empty after trim", async () => {
      const tester = new HttpSpeechConnectionTester(5000);
      const result = await tester.ping(cfg({}), "   ");
      expect(result).toEqual({
        ok: false,
        latencyMs: 0,
        error: "API key is empty",
      });
      expect(mockedLookup).not.toHaveBeenCalled();
    });
  });

  describe("keyless provider (Issue #788)", () => {
    it("bypasses the empty-key guard and dispatches with the injected binding when the provider is keyless", async () => {
      const ping = vi.fn(async () => ({ ok: true }));
      mockedLookup.mockReturnValueOnce(adapter(ping));

      const tester = new HttpSpeechConnectionTester(5000, FAKE_AI);
      const config = cfg({ provider: "deepgram-workers-ai" });
      // Empty api key — a REST provider would short-circuit; keyless proceeds.
      const result = await tester.ping(config, "");

      expect(mockedLookup).toHaveBeenCalledWith("deepgram-workers-ai");
      expect(ping).toHaveBeenCalledTimes(1);
      expect(ping).toHaveBeenCalledWith(config, "", 5000, { ai: FAKE_AI });
      expect(result.ok).toBe(true);
    });

    it("reports ok: false when the keyless adapter has no binding (probe returns not-configured)", async () => {
      // Mirror the real adapter's ping: ok:false when deps.ai is absent.
      const ping = vi.fn(async (_c, _k, _t, deps?: SpeechAdapterDeps) =>
        deps?.ai !== undefined
          ? { ok: true }
          : { ok: false, error: "AI binding is not configured" },
      );
      mockedLookup.mockReturnValueOnce(adapter(ping));

      // No binding injected into the tester.
      const tester = new HttpSpeechConnectionTester(5000);
      const result = await tester.ping(
        cfg({ provider: "deepgram-workers-ai" }),
        "",
      );

      expect(ping).toHaveBeenCalledWith(expect.anything(), "", 5000, undefined);
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toMatch(
        /AI binding is not configured/,
      );
    });
  });

  describe("provider dispatch", () => {
    it("dispatches to the looked-up adapter ping with the trimmed apiKey + timeoutMs", async () => {
      const ping = vi.fn(async () => ({ ok: true }));
      mockedLookup.mockReturnValueOnce(adapter(ping));

      const tester = new HttpSpeechConnectionTester(7000);
      const config = cfg({ provider: "openai" });
      const result = await tester.ping(config, "  sk-openai  ");

      expect(mockedLookup).toHaveBeenCalledWith("openai");
      expect(ping).toHaveBeenCalledTimes(1);
      // No AI binding injected → deps arg is undefined for REST providers.
      expect(ping).toHaveBeenCalledWith(config, "sk-openai", 7000, undefined);
      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.latencyMs)).toBe(true);
    });

    it("returns ok: false when the provider is unregistered (defensive net)", async () => {
      mockedLookup.mockReturnValueOnce(undefined);
      const tester = new HttpSpeechConnectionTester(5000);
      const result = await tester.ping(cfg({ provider: "deepgram" }), "sk-x");
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toMatch(
        /Unsupported speech provider: deepgram/,
      );
    });
  });

  describe("result envelope normalization", () => {
    it("normalizes a { ok: false, error } probe result into { ok: false, latencyMs, error }", async () => {
      mockedLookup.mockReturnValueOnce(
        adapter(vi.fn(async () => ({ ok: false, error: "HTTP 404" }))),
      );
      const tester = new HttpSpeechConnectionTester(5000);
      const result = await tester.ping(cfg({}), "sk-openai");
      expect(result.ok).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect((result as { error: string }).error).toBe("HTTP 404");
    });

    it("omits the error field when the probe returns ok: false without a message", async () => {
      mockedLookup.mockReturnValueOnce(
        adapter(vi.fn(async () => ({ ok: false }))),
      );
      const tester = new HttpSpeechConnectionTester(5000);
      const result = await tester.ping(cfg({}), "sk-openai");
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("error");
    });

    it("masks secrets in a raw probe-returned error string (defense in depth)", async () => {
      mockedLookup.mockReturnValueOnce(
        adapter(
          vi.fn(async () => ({
            ok: false,
            error: "Authorization: Bearer sk-leaked-OPENAI-token-xxxx provided",
          })),
        ),
      );
      const tester = new HttpSpeechConnectionTester(5000);
      const result = await tester.ping(cfg({}), "sk-test");
      expect(result.ok).toBe(false);
      const error = (result as { error: string }).error;
      expect(error).not.toContain("sk-leaked-OPENAI-token-xxxx");
      expect(error).toContain("Bearer ***");
    });
  });
});
