import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeechFailureError } from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import { OpenAISpeechRecognitionProvider } from "../speechRecognitionProvider";

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

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
    baseURL: string;
  }> = {},
): OpenAISpeechRecognitionProvider {
  return new OpenAISpeechRecognitionProvider({
    apiKey: overrides.apiKey ?? "sk-test",
    model: overrides.model ?? "gpt-4o-transcribe",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
    ...(overrides.baseURL !== undefined ? { baseURL: overrides.baseURL } : {}),
  });
}

const INPUT = {
  audioBytes: audioBytes(),
  mime: "audio/webm",
  locale: "ja-JP",
} as const;

describe("OpenAISpeechRecognitionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns the transcript and POSTs multipart/form-data to /audio/transcriptions", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, { text: "こんにちは世界" }),
      );
      setFetch(mock);

      const provider = makeProvider();
      const result = await provider.transcribe(INPUT);
      expect(result).toBe("こんにちは世界");

      const [url, init] = mock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({ authorization: "Bearer sk-test" });
      // The Content-Type boundary is set by fetch from the FormData body —
      // the adapter must NOT set it by hand (that would omit the boundary).
      expect(init.headers).not.toHaveProperty("content-type");
      expect(init.body).toBeInstanceOf(FormData);
      const form = init.body as FormData;
      expect(form.get("model")).toBe("gpt-4o-transcribe");
      // locale `ja-JP` → ISO-639-1 primary subtag `ja`.
      expect(form.get("language")).toBe("ja");
      const file = form.get("file");
      expect(file).toBeInstanceOf(Blob);
    });

    it("trims surrounding whitespace from the transcript", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { text: "  hi there  " })));
      const result = await makeProvider().transcribe(INPUT);
      expect(result).toBe("hi there");
    });

    it("returns an empty string when no usable text field is present (no detected speech)", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, {})));
      const result = await makeProvider().transcribe(INPUT);
      expect(result).toBe("");
    });

    it("returns an empty string for a whitespace-only transcript", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { text: "   " })));
      const result = await makeProvider().transcribe(INPUT);
      expect(result).toBe("");
    });

    it("forwards a non-default baseURL into the fetched URL", async () => {
      const mock = vi.fn(async () => jsonResponse(200, { text: "ok" }));
      setFetch(mock);
      await makeProvider({ baseURL: "https://example.com/v1" }).transcribe(
        INPUT,
      );
      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://example.com/v1/audio/transcriptions");
    });

    it("names the file field with a MIME-derived extension so OpenAI can detect the format", async () => {
      // OpenAI keys format detection off the `file` field's filename
      // extension (ADR-008). A default `blob` name would be rejected, so the
      // adapter derives `audio.<subtype>` from the MIME type.
      const mock = vi.fn(async () => jsonResponse(200, { text: "ok" }));
      setFetch(mock);
      await makeProvider().transcribe({ ...INPUT, mime: "audio/webm" });
      const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
      const file = (init.body as FormData).get("file");
      expect(file).toBeInstanceOf(File);
      expect((file as File).name).toBe("audio.webm");
    });

    it("strips the `x-` prefix from the MIME subtype when deriving the filename", async () => {
      // `audio/x-m4a` → `audio.m4a` (the `x-` experimental prefix is dropped).
      const mock = vi.fn(async () => jsonResponse(200, { text: "ok" }));
      setFetch(mock);
      await makeProvider().transcribe({ ...INPUT, mime: "audio/x-m4a" });
      const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
      const file = (init.body as FormData).get("file");
      expect((file as File).name).toBe("audio.m4a");
    });

    it("omits the language field for an empty locale", async () => {
      const mock = vi.fn(async () => jsonResponse(200, { text: "ok" }));
      setFetch(mock);
      await makeProvider().transcribe({ ...INPUT, locale: "" });
      const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
      const form = init.body as FormData;
      expect(form.get("language")).toBeNull();
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

    it("rejects audio larger than 25 MiB with SpeechFailureError without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      const provider = makeProvider();
      await expect(
        provider.transcribe({
          ...INPUT,
          audioBytes: new ArrayBuffer(25 * 1024 * 1024 + 1),
        }),
      ).rejects.toBeInstanceOf(SpeechFailureError);
      expect(mock).not.toHaveBeenCalled();
    });

    it("accepts audio exactly at the 25 MiB boundary (does NOT pre-fail)", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { text: "ok" })));
      const provider = makeProvider();
      await expect(
        provider.transcribe({
          ...INPUT,
          audioBytes: new ArrayBuffer(25 * 1024 * 1024),
        }),
      ).resolves.toBe("ok");
    });
  });

  describe("error mapping", () => {
    it("maps HTTP 401 to a SpeechFailureError carrying the status and sanitized detail", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: {
              type: "invalid_api_key",
              message: "Invalid API key provided",
            },
          }),
        ),
      );
      try {
        await makeProvider().transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        const message = (error as Error).message;
        // The HTTP status must survive into the message...
        expect(message).toContain("HTTP 401");
        // ...and the provider detail is run through `sanitizeErrorReason`,
        // which classifies an `invalid api key` message under the
        // `auth_failed` category (a bare `toBeInstanceOf` would not catch a
        // regression that drops the sanitized detail entirely).
        expect(message).toContain("auth_failed");
      }
    });

    it("maps HTTP 429 to SpeechFailureError", async () => {
      setFetch(
        vi.fn(async () => jsonResponse(429, { error: { type: "rate_limit" } })),
      );
      await expect(makeProvider().transcribe(INPUT)).rejects.toBeInstanceOf(
        SpeechFailureError,
      );
    });

    it("maps HTTP 500 to a SpeechFailureError carrying the status", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, {
            error: { type: "server_error", message: "upstream exploded" },
          }),
        ),
      );
      try {
        await makeProvider().transcribe(INPUT);
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechFailureError);
        // 5xx must surface the status (symmetric with the ping side, which
        // asserts the reason wording rather than just the error type).
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
      // The fetch rejects with a `DOMException` (name="AbortError"), which is
      // how Cloudflare Workers' workerd aborts a fetch. On workerd
      // `DOMException` does NOT extend `Error`, so asserting only the type
      // (`toBeInstanceOf(SpeechFailureError)`) would pass even if the adapter
      // misclassified the abort into the generic transport branch. Asserting
      // the timeout wording is what catches the W-001 Workers regression — in
      // Node, vitest's `DOMException` happens to extend `Error`, so the type
      // check cannot distinguish the two branches.
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
        // Must be the timeout branch, not the generic `sanitizeErrorReason`
        // transport reason (which would read `timeout: aborted` / `unknown:`).
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

    it("does not leak the api key in the SpeechFailureError message on a 401", async () => {
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
