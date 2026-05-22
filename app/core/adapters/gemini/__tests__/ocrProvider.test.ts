import { afterEach, describe, expect, it, vi } from "vitest";
import { OCRFailureError } from "@/core/domain/ingestion/ports/ocrProvider";
import { GeminiOCRProvider } from "../ocrProvider";

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
): GeminiOCRProvider {
  return new GeminiOCRProvider({
    apiKey: overrides.apiKey ?? "AIzaSyTEST",
    model: overrides.model ?? "gemini-1.5-flash",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
  });
}

describe("GeminiOCRProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns extracted text and sends an inlineData image part", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, {
          candidates: [
            {
              content: {
                parts: [{ text: "extracted line\nsecond line" }],
              },
            },
          ],
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
      const call = mock.mock.calls[0] as unknown as [string, RequestInit];
      const url = call[0];
      const init = call[1];

      // URL must not carry the API key.
      expect(url).not.toContain("AIzaSyTEST");
      expect(url).not.toContain("key=");
      expect(init.headers).toMatchObject({
        "x-goog-api-key": "AIzaSyTEST",
      });

      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                },
              },
            ],
          },
        ],
      });
      const data = body.contents[0].parts[0].inlineData.data;
      expect(typeof data).toBe("string");
      expect(data.length).toBeGreaterThan(0);
    });

    it("returns an empty string when the response has no text part", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, {
            candidates: [{ content: { parts: [] } }],
          }),
        ),
      );

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
        vi.fn(async () =>
          jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } }),
        ),
      );
      await expect(
        makeProvider().extractText({
          imageBytes: pngBytes(),
          mime: "image/png",
        }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps HTTP 500 to OCRFailureError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, {
            error: { status: "INTERNAL", message: "boom" },
          }),
        ),
      );
      await expect(
        makeProvider().extractText({
          imageBytes: pngBytes(),
          mime: "image/png",
        }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps HTTP 401 to OCRFailureError (quota path)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: { status: "UNAUTHENTICATED", message: "bad key" },
          }),
        ),
      );
      await expect(
        makeProvider().extractText({
          imageBytes: pngBytes(),
          mime: "image/png",
        }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps HTTP 403 to OCRFailureError (quota path)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { status: "PERMISSION_DENIED", message: "no access" },
          }),
        ),
      );
      await expect(
        makeProvider().extractText({
          imageBytes: pngBytes(),
          mime: "image/png",
        }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });

    it("maps fetch TypeError to OCRFailureError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      await expect(
        makeProvider().extractText({
          imageBytes: pngBytes(),
          mime: "image/png",
        }),
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
      await expect(
        makeProvider({ timeoutMs: 5 }).extractText({
          imageBytes: pngBytes(),
          mime: "image/png",
        }),
      ).rejects.toBeInstanceOf(OCRFailureError);
    });
  });

  describe("pre-flight guards", () => {
    it("rejects unsupported MIME types without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);

      await expect(
        makeProvider().extractText({
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

      await expect(
        makeProvider().extractText({
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
          new GeminiOCRProvider({
            apiKey: "",
            model: "gemini-1.5-flash",
          }),
      ).toThrow(/apiKey is empty/);
    });

    it("rejects empty model", () => {
      expect(
        () =>
          new GeminiOCRProvider({
            apiKey: "AIzaSyTEST",
            model: "",
          }),
      ).toThrow(/model is empty/);
    });
  });
});
