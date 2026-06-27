import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeechFailureError } from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import { GeminiSpeechRecognitionProvider } from "../speechRecognitionProvider";

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

function transcriptResponse(transcript: string): unknown {
  return {
    candidates: [{ content: { parts: [{ text: transcript }] } }],
  };
}

// Known fixed bytes so the base64 payload can be verified independently of the
// adapter's own `arrayBufferToBase64`.
const AUDIO_BYTES = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
const EXPECTED_BASE64 = btoa(String.fromCharCode(0, 1, 2, 3, 4, 5, 6, 7));

const INPUT = {
  audioBytes: AUDIO_BYTES.buffer,
  mime: "audio/webm",
  locale: "ja-JP",
} as const;

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
  }> = {},
): GeminiSpeechRecognitionProvider {
  return new GeminiSpeechRecognitionProvider({
    apiKey: overrides.apiKey ?? "AIzaSyTEST",
    model: overrides.model ?? "gemini-2.5-flash",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
  });
}

describe("GeminiSpeechRecognitionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns the transcript and POSTs an inlineData base64 audio part with the x-goog-api-key header", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, transcriptResponse("こんにちは世界")),
      );
      setFetch(mock);

      const result = await makeProvider().transcribe(INPUT);
      expect(result).toBe("こんにちは世界");

      const [url, init] = mock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      // URL targets generateContent and never carries the API key.
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      );
      expect(url).not.toContain("AIzaSyTEST");
      expect(url).not.toContain("key=");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({
        "content-type": "application/json",
        "x-goog-api-key": "AIzaSyTEST",
      });

      const body = JSON.parse(init.body as string);
      expect(body.contents[0].parts[0].inlineData.mimeType).toBe("audio/webm");
      expect(body.contents[0].parts[0].inlineData.data).toBe(EXPECTED_BASE64);
      // Speech adapter overrides the LLM-mode 4096 ceiling to 16384.
      expect(body.generationConfig.maxOutputTokens).toBe(16_384);
      // locale is woven into the system prompt.
      expect(body.systemInstruction.parts[0].text).toContain("ja-JP");
    });

    it("trims surrounding whitespace from the transcript", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, transcriptResponse("  hi there  ")),
        ),
      );
      expect(await makeProvider().transcribe(INPUT)).toBe("hi there");
    });

    it("returns an empty string when the response has no text parts (no detected speech)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, { candidates: [{ content: { parts: [] } }] }),
        ),
      );
      expect(await makeProvider().transcribe(INPUT)).toBe("");
    });

    it("omits the locale hint from the prompt for an empty locale", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, transcriptResponse("ok")),
      );
      setFetch(mock);
      await makeProvider().transcribe({ ...INPUT, locale: "" });
      const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.systemInstruction.parts[0].text).not.toContain("locale");
    });
  });

  describe("pre-flight guards (no fetch)", () => {
    it("rejects an empty apiKey with SpeechFailureError without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      await expect(
        makeProvider({ apiKey: "   " }).transcribe(INPUT),
      ).rejects.toBeInstanceOf(SpeechFailureError);
      expect(mock).not.toHaveBeenCalled();
    });

    it("rejects audio whose base64-encoded size exceeds the request ceiling without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      // 15 MiB raw base64-inflates past the 20MB total-request ceiling.
      const oversize = {
        ...INPUT,
        audioBytes: new ArrayBuffer(15 * 1024 * 1024 + 1),
      };
      await expect(makeProvider().transcribe(oversize)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe("error mapping", () => {
    it("maps HTTP 400 (unsupported audio format) to SpeechFailureError", async () => {
      // The unhappy-path format-rejection case: an unsupported mime surfaces as
      // a Gemini 400 which `throwForStatus` folds into `mapper.unavailable`.
      setFetch(
        vi.fn(async () =>
          jsonResponse(400, {
            error: {
              status: "INVALID_ARGUMENT",
              message: "Unsupported audio format",
            },
          }),
        ),
      );
      try {
        await makeProvider().transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        expect((error as Error).message).toContain("HTTP 400");
      }
    });

    it("maps HTTP 401 to SpeechFailureError (quota path)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: { status: "UNAUTHENTICATED", message: "bad key" },
          }),
        ),
      );
      await expect(makeProvider().transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
    });

    it("maps HTTP 403 to SpeechFailureError (quota path)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { status: "PERMISSION_DENIED", message: "no access" },
          }),
        ),
      );
      await expect(makeProvider().transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
    });

    it("maps HTTP 429 to SpeechFailureError (rate limit)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } }),
        ),
      );
      await expect(makeProvider().transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
    });

    it("maps HTTP 500 to SpeechFailureError carrying the status", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, { error: { status: "INTERNAL", message: "boom" } }),
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

    it("maps a DOMException AbortError (timeout) to SpeechFailureError", async () => {
      // workerd aborts a fetch with a `DOMException` (name="AbortError") that
      // does NOT extend `Error`; the shared `isAbortError` guard classifies it
      // as a timeout rather than a generic transport failure.
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
        expect((error as Error).message).toMatch(/aborted/);
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

    it("masks AIza keys echoed in the error body on a 4xx", async () => {
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
        await makeProvider().transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        expect((error as Error).message).not.toContain("AIzaSyLEAKEDKEY1234");
      }
    });
  });
});
