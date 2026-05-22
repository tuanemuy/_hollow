import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arrayBufferToBase64,
  callGeminiGenerate,
  type GeminiErrorMapper,
} from "../messagesClient";

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

class RateLimitTestError extends Error {
  override readonly name = "RateLimitTestError";
}
class UnavailableTestError extends Error {
  override readonly name = "UnavailableTestError";
}
class TimeoutTestError extends Error {
  override readonly name = "TimeoutTestError";
}
class QuotaTestError extends Error {
  override readonly name = "QuotaTestError";
}

const mapper: GeminiErrorMapper = {
  rateLimit: (message, cause) => new RateLimitTestError(message, { cause }),
  unavailable: (message, cause) => new UnavailableTestError(message, { cause }),
  timeout: (message, cause) => new TimeoutTestError(message, { cause }),
  quota: (message, cause) => new QuotaTestError(message, { cause }),
};

function roundTrip(buffer: ArrayBuffer): Uint8Array {
  const base64 = arrayBufferToBase64(buffer);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function makeRandomBuffer(size: number): ArrayBuffer {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = (i * 2654435761) & 0xff;
  }
  return bytes.buffer;
}

describe("arrayBufferToBase64 (Gemini adapter)", () => {
  it("returns an empty string for an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  it("round-trips across the 8KB chunk boundary", () => {
    for (const size of [8191, 8192, 8193, 100 * 1024]) {
      const buffer = makeRandomBuffer(size);
      const decoded = roundTrip(buffer);
      expect(decoded).toEqual(new Uint8Array(buffer));
    }
  });
});

describe("callGeminiGenerate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the API key via the x-goog-api-key header and never on the URL", async () => {
    const mock = vi.fn(async () =>
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      }),
    );
    setFetch(mock);

    const result = await callGeminiGenerate(
      {
        apiKey: "AIzaSyTEST123",
        model: "gemini-1.5-flash",
      },
      "system prompt",
      [{ text: "hello" }],
      mapper,
    );

    expect(result).toBe("ok");
    expect(mock).toHaveBeenCalledTimes(1);
    const call = mock.mock.calls[0] as unknown as [string, RequestInit];
    const url = call[0];
    const init = call[1];

    // URL must NOT contain the API key (ADR-002 / log-leakage avoidance).
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
    );
    expect(url).not.toContain("AIzaSyTEST123");
    expect(url).not.toContain("key=");

    // Auth is sent via the x-goog-api-key header.
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-goog-api-key": "AIzaSyTEST123",
    });

    // Body shape: contents/parts + systemInstruction + generationConfig.
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      contents: [
        {
          role: "user",
          parts: [{ text: "hello" }],
        },
      ],
      systemInstruction: {
        parts: [{ text: "system prompt" }],
      },
      generationConfig: {
        maxOutputTokens: 4096,
      },
    });
  });

  it("joins multiple text parts in the response with newlines and trims the result", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(200, {
          candidates: [
            {
              content: {
                parts: [{ text: "  first" }, { text: "second  " }],
              },
            },
          ],
        }),
      ),
    );
    const result = await callGeminiGenerate(
      { apiKey: "k", model: "gemini-1.5-flash" },
      "sys",
      [{ text: "u" }],
      mapper,
    );
    expect(result).toBe("first\nsecond");
  });

  it("returns empty string when candidates has no parts", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(200, { candidates: [{ content: { parts: [] } }] }),
      ),
    );
    const result = await callGeminiGenerate(
      { apiKey: "k", model: "gemini-1.5-flash" },
      "sys",
      [{ text: "u" }],
      mapper,
    );
    expect(result).toBe("");
  });

  it("maps HTTP 429 to the rateLimit mapper branch", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(429, {
          error: { status: "RESOURCE_EXHAUSTED", message: "too many" },
        }),
      ),
    );
    await expect(
      callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash" },
        "sys",
        [{ text: "u" }],
        mapper,
      ),
    ).rejects.toBeInstanceOf(RateLimitTestError);
  });

  it("maps HTTP 500 to the unavailable mapper branch", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(500, {
          error: { status: "INTERNAL", message: "boom" },
        }),
      ),
    );
    await expect(
      callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash" },
        "sys",
        [{ text: "u" }],
        mapper,
      ),
    ).rejects.toBeInstanceOf(UnavailableTestError);
  });

  it("maps HTTP 401 to the quota mapper branch", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(401, {
          error: { status: "UNAUTHENTICATED", message: "bad key" },
        }),
      ),
    );
    await expect(
      callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash" },
        "sys",
        [{ text: "u" }],
        mapper,
      ),
    ).rejects.toBeInstanceOf(QuotaTestError);
  });

  it("maps HTTP 403 to the quota mapper branch", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(403, {
          error: { status: "PERMISSION_DENIED", message: "no access" },
        }),
      ),
    );
    await expect(
      callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash" },
        "sys",
        [{ text: "u" }],
        mapper,
      ),
    ).rejects.toBeInstanceOf(QuotaTestError);
  });

  it("maps AbortError (timeout) to the timeout mapper branch", async () => {
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
    await expect(
      callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash", timeoutMs: 5 },
        "sys",
        [{ text: "u" }],
        mapper,
      ),
    ).rejects.toBeInstanceOf(TimeoutTestError);
  });

  it("maps a fetch TypeError to the unavailable mapper branch", async () => {
    setFetch(
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash" },
        "sys",
        [{ text: "u" }],
        mapper,
      ),
    ).rejects.toBeInstanceOf(UnavailableTestError);
  });

  it("maps a non-AbortError / non-TypeError throw to the unavailable mapper branch", async () => {
    setFetch(
      vi.fn(async () => {
        throw new RangeError("boom");
      }),
    );
    await expect(
      callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash" },
        "sys",
        [{ text: "u" }],
        mapper,
      ),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof UnavailableTestError &&
        e.message.startsWith("Unexpected error while calling Gemini"),
    );
  });

  it("masks secrets in the provider 4xx error body before embedding it into the thrown message", async () => {
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
    try {
      await callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash" },
        "sys",
        [{ text: "u" }],
        mapper,
      );
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(QuotaTestError);
      const message = (e as Error).message;
      expect(message).not.toContain("AIzaSyLEAKEDKEY1234");
      expect(message).toContain("***");
    }
  });

  it("maps non-JSON HTTP 200 bodies to the unavailable mapper branch with cause", async () => {
    setFetch(
      vi.fn(
        async () =>
          new Response("<<not json>>", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
      ),
    );
    await expect(
      callGeminiGenerate(
        { apiKey: "k", model: "gemini-1.5-flash" },
        "sys",
        [{ text: "u" }],
        mapper,
      ),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof UnavailableTestError &&
        e.message === "Gemini response was not valid JSON" &&
        e.cause instanceof Error,
    );
  });
});
