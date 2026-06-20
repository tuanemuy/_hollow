import { afterEach, describe, expect, it, vi } from "vitest";
import { pingDeepgramSpeech } from "../speechConnectionPing";

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
  apiKey: "dg-test",
  model: "nova-3",
} as const;

describe("pingDeepgramSpeech", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("input guards", () => {
    it("returns ok: false when apiKey is empty (after trim)", async () => {
      const result = await pingDeepgramSpeech({
        ...BASE_CONFIG,
        apiKey: "   ",
      });
      expect(result).toEqual({ ok: false, reason: "API key is empty" });
    });

    it("returns ok: false when model is empty (UX symmetry with the OpenAI probe)", async () => {
      const result = await pingDeepgramSpeech({ ...BASE_CONFIG, model: "" });
      expect(result).toEqual({ ok: false, reason: "model is empty" });
    });
  });

  describe("success path", () => {
    it("returns ok: true on 2xx and GETs /v1/projects with a Token auth header", async () => {
      const mock = vi.fn(async () => jsonResponse(200, { projects: [] }));
      setFetch(mock);

      const result = await pingDeepgramSpeech(BASE_CONFIG);
      expect(result).toEqual({ ok: true });

      const [url, init] = mock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("https://api.deepgram.com/v1/projects");
      expect(init.method).toBe("GET");
      expect(init.headers).toMatchObject({ authorization: "Token dg-test" });
    });
  });

  describe("failure mapping", () => {
    it("prefixes the reason with the provider err_code on 401 (symmetric with OpenAI's type prefix)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            err_code: "INVALID_AUTH",
            err_msg: "bad credentials",
          }),
        ),
      );
      const result = await pingDeepgramSpeech(BASE_CONFIG);
      expect(result).toEqual({
        ok: false,
        reason: "INVALID_AUTH: bad credentials",
      });
    });

    it("omits the err_code prefix when the error body has no err_code", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(429, {
            message: "rate limited",
          }),
        ),
      );
      const result = await pingDeepgramSpeech(BASE_CONFIG);
      expect(result).toEqual({ ok: false, reason: "rate limited" });
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
      const result = await pingDeepgramSpeech(BASE_CONFIG);
      expect(result).toEqual({ ok: false, reason: "HTTP 502" });
    });

    it("reports timeout reason when fetch is aborted with a DOMException AbortError", async () => {
      // workerd aborts a fetch with a `DOMException` (name="AbortError") that
      // does NOT extend `Error`. Asserting the `timed out` wording (not just
      // `ok: false`) catches an `instanceof Error`-only misclassification on
      // Workers.
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
      const result = await pingDeepgramSpeech({ ...BASE_CONFIG, timeoutMs: 5 });
      expect(result).toMatchObject({ ok: false });
      expect((result as { reason: string }).reason).toMatch(/timed out/);
    });

    it("reports a sanitized network category when fetch throws a TypeError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("network down");
        }),
      );
      const result = await pingDeepgramSpeech(BASE_CONFIG);
      expect(result).toEqual({ ok: false, reason: "network: network down" });
    });

    it("masks secrets in the error body message", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            err_code: "INVALID_AUTH",
            err_msg: "key sk-secretvalueabcdef is invalid",
          }),
        ),
      );
      const result = await pingDeepgramSpeech(BASE_CONFIG);
      expect(result.ok).toBe(false);
      const reason = (result as { reason: string }).reason;
      expect(reason).not.toContain("sk-secretvalueabcdef");
      expect(reason).toContain("***");
    });
  });
});
