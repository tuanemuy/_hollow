import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFParseError } from "@/core/domain/ingestion/ports/pdfExtractor";
import { AnthropicPDFExtractor } from "../pdfExtractor";

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
): AnthropicPDFExtractor {
  return new AnthropicPDFExtractor({
    apiKey: overrides.apiKey ?? "sk-ant-test",
    model: overrides.model ?? "claude-3-5-sonnet-latest",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
  });
}

describe("AnthropicPDFExtractor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns { textual: true, text, pageImages: [] } and sends a document block", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, {
          content: [{ type: "text", text: "page one\n\npage two" }],
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
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
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

    it("returns empty text when the response has no text block", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, { content: [{ type: "tool_use", id: "x" }] }),
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
        vi.fn(async () => jsonResponse(429, { error: { type: "rate_limit" } })),
      );
      const extractor = makeExtractor();
      await expect(
        extractor.extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });

    it("maps HTTP 500 to PDFParseError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, { error: { type: "api_error", message: "boom" } }),
        ),
      );
      const extractor = makeExtractor();
      await expect(
        extractor.extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });

    it("maps HTTP 403 + permission_error to PDFParseError (quota path)", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { type: "permission_error", message: "billing" },
          }),
        ),
      );
      const extractor = makeExtractor();
      await expect(
        extractor.extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });

    it("maps fetch TypeError to PDFParseError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      const extractor = makeExtractor();
      await expect(
        extractor.extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
      await expect(
        extractor.extract({ bytes: pdfBytes() }),
      ).rejects.toMatchObject({ cause: expect.any(TypeError) });
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
      const extractor = makeExtractor({ timeoutMs: 5 });
      await expect(
        extractor.extract({ bytes: pdfBytes() }),
      ).rejects.toBeInstanceOf(PDFParseError);
    });
  });

  describe("pre-flight guards", () => {
    it("rejects PDFs larger than 32MB without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      const extractor = makeExtractor();
      await expect(
        extractor.extract({ bytes: new ArrayBuffer(32 * 1024 * 1024 + 1) }),
      ).rejects.toBeInstanceOf(PDFParseError);
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe("constructor guards", () => {
    it("rejects empty apiKey", () => {
      expect(
        () =>
          new AnthropicPDFExtractor({
            apiKey: "",
            model: "claude-3-5-sonnet-latest",
          }),
      ).toThrow(/apiKey is empty/);
    });

    it("rejects empty model", () => {
      expect(
        () =>
          new AnthropicPDFExtractor({
            apiKey: "sk-ant-test",
            model: "",
          }),
      ).toThrow(/model is empty/);
    });
  });
});
