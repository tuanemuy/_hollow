import { afterEach, describe, expect, it, vi } from "vitest";
import { pingGemini } from "../connectionPing";

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

describe("pingGemini", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns { ok: true } on 2xx and sends the API key via the x-goog-api-key header", async () => {
    const mock = vi.fn(async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: "" }] } }],
      }),
    );
    setFetch(mock);

    const result = await pingGemini({
      apiKey: "AIzaSyTEST",
      model: "gemini-1.5-flash",
    });

    expect(result).toEqual({ ok: true });
    expect(mock).toHaveBeenCalledTimes(1);
    const call = mock.mock.calls[0] as unknown as [string, RequestInit];
    const url = call[0];
    const init = call[1];

    // Per ADR-002 the API key never appears on the URL.
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
    );
    expect(url).not.toContain("AIzaSyTEST");
    expect(url).not.toContain("key=");

    // The probe uses the x-goog-api-key header.
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-goog-api-key": "AIzaSyTEST",
    });

    // The body is a minimal "ping" generation request capped at 1 output token.
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 1 },
    });
  });

  it("returns { ok: false, reason } with the provider's error message on a 4xx response", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(401, {
          error: { status: "UNAUTHENTICATED", message: "API key invalid" },
        }),
      ),
    );
    const result = await pingGemini({
      apiKey: "wrong-key",
      model: "gemini-1.5-flash",
    });
    expect(result).toEqual({
      ok: false,
      reason: "UNAUTHENTICATED: API key invalid",
    });
  });

  it("falls back to an HTTP-status reason when the error body cannot be parsed", async () => {
    setFetch(
      vi.fn(
        async () =>
          new Response("oops", {
            status: 503,
            headers: { "content-type": "text/plain" },
          }),
      ),
    );
    const result = await pingGemini({
      apiKey: "k",
      model: "gemini-1.5-flash",
    });
    expect(result).toEqual({ ok: false, reason: "HTTP 503" });
  });

  it("returns { ok: false, reason } when the API key is empty (no fetch)", async () => {
    const mock = vi.fn();
    setFetch(mock);
    const result = await pingGemini({
      apiKey: "   ",
      model: "gemini-1.5-flash",
    });
    expect(result).toEqual({ ok: false, reason: "API key is empty" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("returns a timeout reason when the request is aborted", async () => {
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
    const result = await pingGemini({
      apiKey: "k",
      model: "gemini-1.5-flash",
      timeoutMs: 5,
    });
    expect(result).toEqual({
      ok: false,
      reason: "Request timed out after 5ms",
    });
  });

  it("never throws on network TypeError; returns the error message as the reason", async () => {
    setFetch(
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const result = await pingGemini({
      apiKey: "k",
      model: "gemini-1.5-flash",
    });
    expect(result).toEqual({ ok: false, reason: "fetch failed" });
  });
});
