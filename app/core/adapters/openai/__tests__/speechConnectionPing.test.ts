import { afterEach, describe, expect, it, vi } from "vitest";
import { pingOpenAISpeech } from "../speechConnectionPing";

type FetchMock = ReturnType<typeof vi.fn>;

function setFetch(mock: FetchMock): void {
  vi.stubGlobal("fetch", mock);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const BASE_CONFIG = {
  apiKey: "sk-test",
  model: "gpt-4o-transcribe",
} as const;

describe("pingOpenAISpeech", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("input guards", () => {
    it("returns ok: false when apiKey is empty (after trim)", async () => {
      const result = await pingOpenAISpeech({ ...BASE_CONFIG, apiKey: "   " });
      expect(result).toEqual({ ok: false, reason: "API key is empty" });
    });

    it("returns ok: false when model is empty", async () => {
      const result = await pingOpenAISpeech({ ...BASE_CONFIG, model: "" });
      expect(result).toEqual({ ok: false, reason: "model is empty" });
    });
  });

  describe("success path", () => {
    it("returns ok: true on 2xx and GETs /models/{model}", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, { id: "gpt-4o-transcribe", object: "model" }),
      );
      setFetch(mock);

      const result = await pingOpenAISpeech(BASE_CONFIG);
      expect(result).toEqual({ ok: true });

      const [url, init] = mock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("https://api.openai.com/v1/models/gpt-4o-transcribe");
      expect(init.method).toBe("GET");
      expect(init.headers).toMatchObject({ authorization: "Bearer sk-test" });
    });

    it("url-encodes the model name into the path", async () => {
      const mock = vi.fn(async () => jsonResponse(200, {}));
      setFetch(mock);
      await pingOpenAISpeech({ ...BASE_CONFIG, model: "gpt 4o/transcribe" });
      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(
        "https://api.openai.com/v1/models/gpt%204o%2Ftranscribe",
      );
    });
  });

  describe("failure mapping", () => {
    it("reports the provider error message when the model is unknown (404)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(404, {
            error: { type: "invalid_request_error", message: "no such model" },
          }),
        ),
      );
      const result = await pingOpenAISpeech(BASE_CONFIG);
      expect(result).toEqual({
        ok: false,
        reason: "invalid_request_error: no such model",
      });
    });

    it("reports auth failure on 401", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: { type: "invalid_api_key", message: "bad key" },
          }),
        ),
      );
      const result = await pingOpenAISpeech(BASE_CONFIG);
      expect(result).toEqual({
        ok: false,
        reason: "invalid_api_key: bad key",
      });
    });

    it("falls back to the HTTP status when error body is missing", async () => {
      setFetch(
        vi.fn(
          async () =>
            new Response("not json", {
              status: 502,
              headers: { "content-type": "text/plain" },
            }),
        ),
      );
      const result = await pingOpenAISpeech(BASE_CONFIG);
      expect(result).toEqual({ ok: false, reason: "HTTP 502" });
    });

    it("reports timeout reason when fetch is aborted with a DOMException AbortError", async () => {
      // workerd aborts a fetch with a `DOMException` (name="AbortError") that
      // does NOT extend `Error`. Asserting the `timed out` wording (not just
      // `ok: false`) is what catches the W-002 regression: an
      // `instanceof Error`-only guard would let the abort fall through to the
      // generic `sanitizeErrorReason` reason on Workers.
      setFetch(
        vi.fn(
          (_url: unknown, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              const signal = init.signal as AbortSignal;
              signal.addEventListener("abort", () => {
                reject(new DOMException("aborted", "AbortError"));
              });
            }),
        ),
      );
      const result = await pingOpenAISpeech({ ...BASE_CONFIG, timeoutMs: 5 });
      expect(result).toMatchObject({ ok: false });
      expect((result as { reason: string }).reason).toMatch(/timed out/);
    });

    it("reports a sanitized network category when fetch throws a TypeError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("network down");
        }),
      );
      const result = await pingOpenAISpeech(BASE_CONFIG);
      expect(result).toEqual({ ok: false, reason: "network: network down" });
    });

    it("masks secrets in the error body message", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: {
              type: "invalid_api_key",
              message: "key sk-secretvalueabcdef is invalid",
            },
          }),
        ),
      );
      const result = await pingOpenAISpeech(BASE_CONFIG);
      expect(result.ok).toBe(false);
      const reason = (result as { reason: string }).reason;
      expect(reason).not.toContain("sk-secretvalueabcdef");
      expect(reason).toContain("***");
    });
  });
});
