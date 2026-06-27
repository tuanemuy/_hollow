import { afterEach, describe, expect, it, vi } from "vitest";
import { pingGeminiSpeech } from "../speechConnectionPing";

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
  apiKey: "AIzaSyTEST",
  model: "gemini-2.5-flash",
} as const;

// `pingGeminiSpeech` is a thin delegate to the shared `pingGemini`. These
// assertions confirm the delegation preserves the probe contract (x-goog-api-key
// auth, the discriminated result, key-empty guard, timeout, masking).
describe("pingGeminiSpeech", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok: true on 2xx and sends the API key via the x-goog-api-key header", async () => {
    const mock = vi.fn(async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: "" }] } }],
      }),
    );
    setFetch(mock);

    const result = await pingGeminiSpeech(BASE_CONFIG);
    expect(result).toEqual({ ok: true });

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(url).not.toContain("AIzaSyTEST");
    expect(url).not.toContain("key=");
    expect(init.headers).toMatchObject({
      "x-goog-api-key": "AIzaSyTEST",
    });
  });

  it("returns ok: false with the provider's error message on a 4xx", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(401, {
          error: { status: "UNAUTHENTICATED", message: "API key invalid" },
        }),
      ),
    );
    const result = await pingGeminiSpeech({ ...BASE_CONFIG, apiKey: "wrong" });
    expect(result).toEqual({
      ok: false,
      reason: "UNAUTHENTICATED: API key invalid",
    });
  });

  it("returns ok: false when the API key is empty (no fetch)", async () => {
    const mock = vi.fn();
    setFetch(mock);
    const result = await pingGeminiSpeech({ ...BASE_CONFIG, apiKey: "   " });
    expect(result).toEqual({ ok: false, reason: "API key is empty" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("reports a timeout reason when the request is aborted", async () => {
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
    const result = await pingGeminiSpeech({ ...BASE_CONFIG, timeoutMs: 5 });
    expect(result).toEqual({
      ok: false,
      reason: "Request timed out after 5ms",
    });
  });

  it("masks secrets in the 4xx error body message", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(403, {
          error: {
            status: "PERMISSION_DENIED",
            message: "key AIzaSyLEAKEDKEY1234 not allowed",
          },
        }),
      ),
    );
    const result = await pingGeminiSpeech(BASE_CONFIG);
    expect(result.ok).toBe(false);
    const reason = (result as { reason: string }).reason;
    expect(reason).not.toContain("AIzaSyLEAKEDKEY1234");
    expect(reason).toContain("***");
  });
});
