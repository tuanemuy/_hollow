import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeechFailureError } from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import { DeepgramSpeechRecognitionProvider } from "../speechRecognitionProvider";

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

function audioBytes(size = 8): ArrayBuffer {
  return new Uint8Array(size).buffer;
}

function transcriptBody(transcript: unknown): unknown {
  return {
    results: { channels: [{ alternatives: [{ transcript }] }] },
  };
}

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
  }> = {},
): DeepgramSpeechRecognitionProvider {
  return new DeepgramSpeechRecognitionProvider({
    apiKey: overrides.apiKey ?? "dg-test",
    model: overrides.model ?? "nova-3",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
  });
}

const INPUT = {
  audioBytes: audioBytes(),
  mime: "audio/webm",
  locale: "ja-JP",
} as const;

describe("DeepgramSpeechRecognitionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns the transcript and POSTs the raw audio body to /v1/listen", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, transcriptBody("こんにちは世界")),
      );
      setFetch(mock);

      const provider = makeProvider();
      const result = await provider.transcribe(INPUT);
      expect(result).toBe("こんにちは世界");

      const [url, init] = mock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(
        "https://api.deepgram.com/v1/listen",
      );
      expect(parsed.searchParams.get("model")).toBe("nova-3");
      // locale `ja-JP` → primary subtag `ja`.
      expect(parsed.searchParams.get("language")).toBe("ja");
      expect(parsed.searchParams.get("smart_format")).toBe("true");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({
        authorization: "Token dg-test",
        "content-type": "audio/webm",
      });
      // Raw body: the ArrayBuffer is sent directly, not wrapped in FormData.
      expect(init.body).not.toBeInstanceOf(FormData);
      expect(init.body).toBe(INPUT.audioBytes);
    });

    it("trims surrounding whitespace from the transcript", async () => {
      setFetch(
        vi.fn(async () => jsonResponse(200, transcriptBody("  hi there  "))),
      );
      const result = await makeProvider().transcribe(INPUT);
      expect(result).toBe("hi there");
    });

    it("returns an empty string when the transcript field is absent (no detected speech)", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { results: {} })));
      const result = await makeProvider().transcribe(INPUT);
      expect(result).toBe("");
    });

    it("returns an empty string when channels/alternatives are empty", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, { results: { channels: [{ alternatives: [] }] } }),
        ),
      );
      const result = await makeProvider().transcribe(INPUT);
      expect(result).toBe("");
    });

    it("returns an empty string for a whitespace-only transcript", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, transcriptBody("   "))));
      const result = await makeProvider().transcribe(INPUT);
      expect(result).toBe("");
    });

    it("omits the language query param for an empty locale", async () => {
      const mock = vi.fn(async () => jsonResponse(200, transcriptBody("ok")));
      setFetch(mock);
      await makeProvider().transcribe({ ...INPUT, locale: "" });
      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(new URL(url).searchParams.has("language")).toBe(false);
    });
  });

  describe("pre-flight guards (no fetch)", () => {
    it("rejects an empty apiKey with SpeechFailureError without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      const provider = makeProvider({ apiKey: "   " });
      await expect(provider.transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe("error mapping", () => {
    it("maps HTTP 401 to a SpeechFailureError carrying the status and sanitized detail", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            err_code: "INVALID_AUTH",
            err_msg: "Invalid API key provided",
          }),
        ),
      );
      try {
        await makeProvider().transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        const message = (error as Error).message;
        expect(message).toContain("HTTP 401");
        // The provider detail is run through `sanitizeErrorReason`, which
        // classifies an `invalid api key` message under `auth_failed`.
        expect(message).toContain("auth_failed");
      }
    });

    it("maps HTTP 429 to SpeechFailureError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(429, { err_code: "RATE_LIMIT_EXCEEDED" }),
        ),
      );
      await expect(makeProvider().transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
    });

    it("maps HTTP 500 to a SpeechFailureError carrying the status", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, {
            err_code: "INTERNAL_ERROR",
            err_msg: "upstream exploded",
          }),
        ),
      );
      try {
        await makeProvider().transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        expect((error as Error).message).toContain("HTTP 500");
      }
    });

    it("maps fetch TypeError (transport) to SpeechFailureError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("network down");
        }),
      );
      await expect(makeProvider().transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
    });

    it("maps a DOMException AbortError (timeout) to a timeout-worded SpeechFailureError", async () => {
      // workerd aborts a fetch with a `DOMException` (name="AbortError") that
      // does NOT extend `Error`. Asserting the timeout wording (not just the
      // type) is what catches the Workers misclassification — in Node,
      // vitest's `DOMException` happens to extend `Error`, so the type check
      // cannot distinguish the abort branch from the transport branch.
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
      try {
        await makeProvider({ timeoutMs: 5 }).transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        expect((error as Error).message).toMatch(/timed out/);
      }
    });

    it("maps a malformed (non-JSON) 2xx body to SpeechFailureError", async () => {
      setFetch(
        vi.fn(
          async () =>
            new Response("not json", {
              status: 200,
              headers: { "content-type": "text/plain" },
            }),
        ),
      );
      await expect(makeProvider().transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
    });

    it("masks a secret-prefixed token echoed in the error body on a 401", async () => {
      // The shared sanitizer masks `sk-`-prefixed tokens; assert a token
      // surfaced in the provider error body is masked out of the failure
      // message (symmetric with the OpenAI adapter's leak guard).
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            err_code: "INVALID_AUTH",
            err_msg: "key sk-secretvalueabcdef is invalid",
          }),
        ),
      );
      try {
        await makeProvider().transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        expect((error as Error).message).not.toContain("sk-secretvalueabcdef");
      }
    });
  });
});
