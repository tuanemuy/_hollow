import { afterEach, describe, expect, it, vi } from "vitest";
import { OCRFailureError } from "@/core/domain/ingestion/ports/ocrProvider";
import { OpenAIOCRProvider } from "../ocrProvider";

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

function pngBytes(size = 8): ArrayBuffer {
  return new Uint8Array(size).buffer;
}

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
    baseURL: string;
  }> = {},
): OpenAIOCRProvider {
  return new OpenAIOCRProvider({
    apiKey: overrides.apiKey ?? "sk-test",
    model: overrides.model ?? "gpt-4o-mini",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
    ...(overrides.baseURL !== undefined ? { baseURL: overrides.baseURL } : {}),
  });
}

describe("OpenAIOCRProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns extracted text and sends an image_url content block with a data URI", async () => {
      const mock = vi.fn(async () =>
        chatTextResponse("extracted line\nsecond line"),
      );
      setFetch(mock);

      const provider = makeProvider();
      const result = await provider.extractText({
        imageBytes: pngBytes(),
        mime: "image/png",
      });

      expect(result).toBe("extracted line\nsecond line");
      const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: expect.stringContaining("OCR") },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: expect.stringMatching(/^data:image\/png;base64,/),
                },
              },
            ],
          },
        ],
      });
    });

    it("returns an empty string when the response has no text content", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { choices: [] })));

      const provider = makeProvider();
      const result = await provider.extractText({
        imageBytes: pngBytes(),
        mime: "image/jpeg",
      });
      expect(result).toBe("");
    });
  });

  describe("baseURL forwarding", () => {
    it("forwards a non-default Azure-style baseURL into the fetched URL while preserving the api-version query string", async () => {
      const mock = vi.fn(async () => chatTextResponse("ok"));
      setFetch(mock);

      const provider = makeProvider({
        baseURL:
          "https://example.azure.com/openai/deployments/dep?api-version=2024-01-01",
      });
      await provider.extractText({
        imageBytes: pngBytes(),
        mime: "image/png",
      });

      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(
        "https://example.azure.com/openai/deployments/dep/chat/completions?api-version=2024-01-01",
      );
    });
  });

  describe("error mapping", () => {
    it("maps HTTP 429 to OCRFailureError", async () => {
      setFetch(
        vi.fn(async () => jsonResponse(429, { error: { type: "rate_limit" } })),
      );
      const provider = makeProvider();
      await expect(
        provider.extractText({ imageBytes: pngBytes(), mime: "image/png" }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps HTTP 500 to OCRFailureError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, { error: { type: "server_error" } }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.extractText({ imageBytes: pngBytes(), mime: "image/png" }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps HTTP 401 to OCRFailureError (quota path)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, { error: { type: "invalid_api_key" } }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.extractText({ imageBytes: pngBytes(), mime: "image/png" }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps fetch TypeError to OCRFailureError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      const provider = makeProvider();
      await expect(
        provider.extractText({ imageBytes: pngBytes(), mime: "image/png" }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps abort/timeout to OCRFailureError", async () => {
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
      const provider = makeProvider({ timeoutMs: 5 });
      await expect(
        provider.extractText({ imageBytes: pngBytes(), mime: "image/png" }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });
  });

  describe("pre-flight guards", () => {
    it("rejects unsupported MIME types without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      const provider = makeProvider();

      await expect(
        provider.extractText({
          imageBytes: pngBytes(),
          mime: "application/octet-stream",
        }),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof OCRFailureError &&
          e.message.includes("unsupported_image_mime") &&
          e.message.includes("application/octet-stream"),
      );
      expect(mock).not.toHaveBeenCalled();
    });

    it("rejects images larger than 5MB without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      const provider = makeProvider();

      await expect(
        provider.extractText({
          imageBytes: new ArrayBuffer(5 * 1024 * 1024 + 1),
          mime: "image/png",
        }),
      ).rejects.toBeInstanceOf(OCRFailureError);
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe("constructor guards", () => {
    it("rejects empty apiKey", () => {
      expect(
        () => new OpenAIOCRProvider({ apiKey: "", model: "gpt-4o-mini" }),
      ).toThrow(/apiKey is empty/);
    });

    it("rejects empty model", () => {
      expect(
        () => new OpenAIOCRProvider({ apiKey: "sk-test", model: "" }),
      ).toThrow(/model is empty/);
    });
  });
});
