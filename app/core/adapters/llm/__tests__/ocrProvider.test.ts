import { afterEach, describe, expect, it, vi } from "vitest";
import { OCRFailureError } from "@/core/domain/ingestion/ports/ocrProvider";
import { AnthropicOCRProvider } from "../ocrProvider";

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

function pngBytes(size = 8): ArrayBuffer {
  return new Uint8Array(size).buffer;
}

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
  }> = {},
): AnthropicOCRProvider {
  return new AnthropicOCRProvider({
    apiKey: overrides.apiKey ?? "sk-ant-test",
    model: overrides.model ?? "claude-3-5-sonnet-latest",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
  });
}

describe("AnthropicOCRProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns extracted text and sends an image content block", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, {
          content: [{ type: "text", text: "extracted line\nsecond line" }],
        }),
      );
      setFetch(mock);

      const provider = makeProvider();
      const result = await provider.extractText({
        imageBytes: pngBytes(),
        mime: "image/png",
      });

      expect(result).toBe("extracted line\nsecond line");
      expect(mock).toHaveBeenCalledTimes(1);
      const call = mock.mock.calls[0] as unknown as [unknown, RequestInit];
      const init = call[1];
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: "claude-3-5-sonnet-latest",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                },
              },
            ],
          },
        ],
      });
      const data = body.messages[0].content[0].source.data;
      expect(typeof data).toBe("string");
      expect(data.length).toBeGreaterThan(0);
    });

    it("returns an empty string when the response has no text block", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, {
          content: [{ type: "tool_use", id: "x" }],
        }),
      );
      setFetch(mock);

      const provider = makeProvider();
      const result = await provider.extractText({
        imageBytes: pngBytes(),
        mime: "image/jpeg",
      });

      expect(result).toBe("");
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
          jsonResponse(500, { error: { type: "api_error", message: "boom" } }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.extractText({ imageBytes: pngBytes(), mime: "image/png" }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps HTTP 403 + permission_error to OCRFailureError (quota path)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { type: "permission_error", message: "quota exceeded" },
          }),
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
      // The fetch mock honours the abort signal so the controller's
      // `AbortError` propagates up — that is the same path that runs
      // when the timer-driven `controller.abort()` fires in production.
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
        () =>
          new AnthropicOCRProvider({
            apiKey: "",
            model: "claude-3-5-sonnet-latest",
          }),
      ).toThrow();
    });

    it("rejects empty model", () => {
      expect(
        () =>
          new AnthropicOCRProvider({
            apiKey: "sk-ant-test",
            model: "",
          }),
      ).toThrow();
    });
  });
});
