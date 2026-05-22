import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFParseError } from "@/core/domain/ingestion/ports/pdfExtractor";
import { GeminiPDFExtractor } from "../pdfExtractor";

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

function pdfBytes(size = 16): ArrayBuffer {
  return new Uint8Array(size).buffer;
}

function makeExtractor(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
  }> = {},
): GeminiPDFExtractor {
  return new GeminiPDFExtractor({
    apiKey: overrides.apiKey ?? "AIzaSyTEST",
    model: overrides.model ?? "gemini-1.5-flash",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
  });
}

describe("GeminiPDFExtractor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns { textual: true, text, pageImages: [] } and sends an inlineData application/pdf part", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, {
          candidates: [
            {
              content: { parts: [{ text: "page one\n\npage two" }] },
            },
          ],
        }),
      );
      setFetch(mock);

      const extractor = makeExtractor();
      const result = await extractor.extract({ bytes: pdfBytes() });

      expect(result).toEqual({
        textual: true,
        text: "page one\n\npage two",
        pageImages: [],
      });
      expect(mock).toHaveBeenCalledTimes(1);
      const call = mock.mock.calls[0] as unknown as [string, RequestInit];
      const url = call[0];
      const init = call[1];

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
                  mimeType: "application/pdf",
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

    it("returns empty text when the response has no text part", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, {
            candidates: [{ content: { parts: [] } }],
          }),
        ),
      );

      const extractor = makeExtractor();
      const result = await extractor.extract({ bytes: pdfBytes() });
      expect(result).toMatchObject({
        textual: true,
        text: "",
        pageImages: [],
      });
    });
  });

  describe("error mapping", () => {
    it("maps HTTP 429 to PDFParseError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } }),
        ),
      );
      await expect(
        makeExtractor().extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });

    it("maps HTTP 500 to PDFParseError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, {
            error: { status: "INTERNAL", message: "boom" },
          }),
        ),
      );
      await expect(
        makeExtractor().extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });

    it("maps HTTP 403 to PDFParseError (quota path)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { status: "PERMISSION_DENIED", message: "no access" },
          }),
        ),
      );
      await expect(
        makeExtractor().extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });

    it("maps fetch TypeError to PDFParseError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      await expect(
        makeExtractor().extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });

    it("maps abort/timeout to PDFParseError", async () => {
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
        makeExtractor({ timeoutMs: 5 }).extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });
  });

  describe("pre-flight guards", () => {
    it("rejects PDFs larger than 32MB without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      await expect(
        makeExtractor().extract({
          bytes: new ArrayBuffer(32 * 1024 * 1024 + 1),
        }),
      ).rejects.toBeInstanceOf(PDFParseError);
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe("constructor guards", () => {
    it("rejects empty apiKey", () => {
      expect(
        () =>
          new GeminiPDFExtractor({
            apiKey: "",
            model: "gemini-1.5-flash",
          }),
      ).toThrow(/apiKey is empty/);
    });

    it("rejects empty model", () => {
      expect(
        () =>
          new GeminiPDFExtractor({
            apiKey: "AIzaSyTEST",
            model: "",
          }),
      ).toThrow(/model is empty/);
    });
  });
});
