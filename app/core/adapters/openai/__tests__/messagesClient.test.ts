import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arrayBufferToBase64,
  buildChatCompletionsURL,
  callOpenAIMessages,
  type OpenAIErrorMapper,
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

function chatTextResponse(text: string): Response {
  return jsonResponse(200, {
    choices: [{ message: { role: "assistant", content: text } }],
  });
}

class RateLimitErr extends Error {
  override readonly name = "RateLimitErr";
}
class UnavailableErr extends Error {
  override readonly name = "UnavailableErr";
}
class TimeoutErr extends Error {
  override readonly name = "TimeoutErr";
}
class QuotaErr extends Error {
  override readonly name = "QuotaErr";
}

const mapper: OpenAIErrorMapper = {
  rateLimit: (m, cause) => new RateLimitErr(m, cause as ErrorOptions),
  unavailable: (m, cause) => new UnavailableErr(m, cause as ErrorOptions),
  timeout: (m, cause) => new TimeoutErr(m, cause as ErrorOptions),
  quota: (m, cause) => new QuotaErr(m, cause as ErrorOptions),
};

const BASE_CONFIG = {
  apiKey: "sk-test",
  model: "gpt-4o-mini",
} as const;

describe("buildChatCompletionsURL", () => {
  it("defaults to https://api.openai.com/v1 and appends /chat/completions", () => {
    expect(buildChatCompletionsURL(undefined)).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("appends /chat/completions onto a base URL without a trailing slash", () => {
    expect(buildChatCompletionsURL("https://api.groq.com/openai/v1")).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
  });

  it("strips a trailing slash before appending /chat/completions", () => {
    expect(buildChatCompletionsURL("https://api.groq.com/openai/v1/")).toBe(
      "https://api.groq.com/openai/v1/chat/completions",
    );
  });

  it("preserves an Azure ?api-version query string", () => {
    const baseURL =
      "https://res.openai.azure.com/openai/deployments/dep?api-version=2024-02-01";
    expect(buildChatCompletionsURL(baseURL)).toBe(
      "https://res.openai.azure.com/openai/deployments/dep/chat/completions?api-version=2024-02-01",
    );
  });

  it("preserves an Azure ?api-version query string when base path has a trailing slash", () => {
    const baseURL =
      "https://res.openai.azure.com/openai/deployments/dep/?api-version=2024-02-01";
    expect(buildChatCompletionsURL(baseURL)).toBe(
      "https://res.openai.azure.com/openai/deployments/dep/chat/completions?api-version=2024-02-01",
    );
  });
});

describe("callOpenAIMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("URL composition", () => {
    it("posts to the default endpoint when baseURL is undefined", async () => {
      const mock = vi.fn(async () => chatTextResponse("ok"));
      setFetch(mock);

      await callOpenAIMessages(
        BASE_CONFIG,
        "sys",
        [{ type: "text", text: "hi" }],
        mapper,
      );

      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("appends /chat/completions onto a configured baseURL", async () => {
      const mock = vi.fn(async () => chatTextResponse("ok"));
      setFetch(mock);

      await callOpenAIMessages(
        { ...BASE_CONFIG, baseURL: "https://api.groq.com/openai/v1" },
        "sys",
        [{ type: "text", text: "hi" }],
        mapper,
      );

      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    });

    it("preserves Azure ?api-version query parameters", async () => {
      const mock = vi.fn(async () => chatTextResponse("ok"));
      setFetch(mock);

      await callOpenAIMessages(
        {
          ...BASE_CONFIG,
          baseURL:
            "https://res.openai.azure.com/openai/deployments/dep?api-version=2024-02-01",
        },
        "sys",
        [{ type: "text", text: "hi" }],
        mapper,
      );

      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(
        "https://res.openai.azure.com/openai/deployments/dep/chat/completions?api-version=2024-02-01",
      );
    });
  });

  describe("request shape", () => {
    it("sends Bearer authorization header and Chat Completions body", async () => {
      const mock = vi.fn(async () => chatTextResponse("hello"));
      setFetch(mock);

      const result = await callOpenAIMessages(
        BASE_CONFIG,
        "system prompt",
        [{ type: "text", text: "user msg" }],
        mapper,
      );
      expect(result).toBe("hello");

      const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({
        "content-type": "application/json",
        authorization: "Bearer sk-test",
      });
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: "gpt-4o-mini",
        max_tokens: 4096,
        messages: [
          { role: "system", content: "system prompt" },
          {
            role: "user",
            content: [{ type: "text", text: "user msg" }],
          },
        ],
      });
    });

    it("concatenates text blocks when content is returned as an array", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, {
          choices: [
            {
              message: {
                role: "assistant",
                content: [
                  { type: "text", text: "line one" },
                  { type: "text", text: "line two" },
                ],
              },
            },
          ],
        }),
      );
      setFetch(mock);

      const result = await callOpenAIMessages(
        BASE_CONFIG,
        "sys",
        [{ type: "text", text: "hi" }],
        mapper,
      );
      expect(result).toBe("line one\nline two");
    });

    it("returns '' when choices is empty", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { choices: [] })));
      const result = await callOpenAIMessages(
        BASE_CONFIG,
        "sys",
        [{ type: "text", text: "hi" }],
        mapper,
      );
      expect(result).toBe("");
    });
  });

  describe("error mapping", () => {
    it("maps HTTP 429 (rate limit) to mapper.rateLimit", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(429, { error: { type: "rate_limit", message: "slow" } }),
        ),
      );
      await expect(
        callOpenAIMessages(
          BASE_CONFIG,
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toBeInstanceOf(RateLimitErr);
    });

    it("maps HTTP 429 with insufficient_quota to mapper.quota", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(429, {
            error: { type: "insufficient_quota", message: "quota exhausted" },
          }),
        ),
      );
      await expect(
        callOpenAIMessages(
          BASE_CONFIG,
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toBeInstanceOf(QuotaErr);
    });

    it("maps HTTP 500 to mapper.unavailable", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, {
            error: { type: "server_error", message: "boom" },
          }),
        ),
      );
      await expect(
        callOpenAIMessages(
          BASE_CONFIG,
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toBeInstanceOf(UnavailableErr);
    });

    it("maps HTTP 401 to mapper.quota", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: { type: "invalid_api_key", message: "bad" },
          }),
        ),
      );
      await expect(
        callOpenAIMessages(
          BASE_CONFIG,
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toBeInstanceOf(QuotaErr);
    });

    it("maps HTTP 403 to mapper.quota", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, { error: { type: "forbidden", message: "no" } }),
        ),
      );
      await expect(
        callOpenAIMessages(
          BASE_CONFIG,
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toBeInstanceOf(QuotaErr);
    });

    it("maps AbortError to mapper.timeout", async () => {
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
        callOpenAIMessages(
          { ...BASE_CONFIG, timeoutMs: 5 },
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toBeInstanceOf(TimeoutErr);
    });

    it("maps fetch TypeError to mapper.unavailable", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      await expect(
        callOpenAIMessages(
          BASE_CONFIG,
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toBeInstanceOf(UnavailableErr);
    });

    it("maps a non-AbortError / non-TypeError throw to mapper.unavailable", async () => {
      // Mirrors the symmetric Gemini test (W-T-005): the "unexpected
      // error" branch covers exotic throws (RangeError, plain string,
      // …) so the caller still receives a port-shaped error instead of
      // a raw provider/native one.
      setFetch(
        vi.fn(async () => {
          throw new RangeError("boom");
        }),
      );
      await expect(
        callOpenAIMessages(
          BASE_CONFIG,
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof UnavailableErr &&
          e.message.startsWith("Unexpected error while calling OpenAI"),
      );
    });

    it("maps non-JSON body to mapper.unavailable", async () => {
      setFetch(
        vi.fn(
          async () =>
            new Response("not json", {
              status: 200,
              headers: { "content-type": "text/plain" },
            }),
        ),
      );
      await expect(
        callOpenAIMessages(
          BASE_CONFIG,
          "sys",
          [{ type: "text", text: "x" }],
          mapper,
        ),
      ).rejects.toBeInstanceOf(UnavailableErr);
    });
  });
});

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

describe("arrayBufferToBase64", () => {
  it("round-trips an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  it("encodes bytes correctly", () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x10, 0x80]);
    const encoded = arrayBufferToBase64(bytes.buffer);
    expect(encoded).toBe(btoa("\x00\xff\x10\x80"));
  });

  it("round-trips across the 8KB chunk boundary", () => {
    // 8KB is the internal chunk size of arrayBufferToBase64. Verifying
    // sizes immediately around the boundary (8191/8192/8193) catches
    // off-by-one errors in the chunk slicing, and 100KB exercises the
    // multi-chunk path.
    for (const size of [8191, 8192, 8193, 100 * 1024]) {
      const buffer = makeRandomBuffer(size);
      const decoded = roundTrip(buffer);
      expect(decoded).toEqual(new Uint8Array(buffer));
    }
  });
});
