import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFParseError } from "@/core/domain/ingestion/ports/pdfExtractor";
import { OpenAIPDFExtractor } from "../pdfExtractor";

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

function pdfBytes(size = 16): ArrayBuffer {
  return new Uint8Array(size).buffer;
}

function makeExtractor(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
    baseURL: string;
  }> = {},
): OpenAIPDFExtractor {
  return new OpenAIPDFExtractor({
    apiKey: overrides.apiKey ?? "sk-test",
    model: overrides.model ?? "gpt-4o",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
    ...(overrides.baseURL !== undefined ? { baseURL: overrides.baseURL } : {}),
  });
}

describe("OpenAIPDFExtractor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns { textual: true, text, pageImages: [] } and sends a file content block", async () => {
      const mock = vi.fn(async () => chatTextResponse("page one\n\npage two"));
      setFetch(mock);

      const extractor = makeExtractor();
      const result = await extractor.extract({ bytes: pdfBytes() });

      expect(result).toEqual({
        textual: true,
        text: "page one\n\npage two",
        pageImages: [],
      });
      const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: "gpt-4o",
        messages: [
          { role: "system" },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: expect.stringMatching(
                    /^data:application\/pdf;base64,/,
                  ),
                },
              },
            ],
          },
        ],
      });
      // OpenAI's PDF input block requires the `filename` field — without it
      // the API rejects the request with HTTP 400. See B-A-001 / review-001.
      const fileBlock = body.messages[1].content[0];
      expect(fileBlock.file.filename).toBe("document.pdf");
    });

    it("returns empty text when the response has no content", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { choices: [] })));

      const extractor = makeExtractor();
      const result = await extractor.extract({ bytes: pdfBytes() });
      expect(result).toMatchObject({
        textual: true,
        text: "",
        pageImages: [],
      });
    });
  });

  describe("baseURL forwarding", () => {
    it("forwards a non-default Azure-style baseURL into the fetched URL while preserving the api-version query string", async () => {
      const mock = vi.fn(async () => chatTextResponse("ok"));
      setFetch(mock);

      const extractor = makeExtractor({
        baseURL:
          "https://example.azure.com/openai/deployments/dep?api-version=2024-01-01",
      });
      await extractor.extract({ bytes: pdfBytes() });

      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(
        "https://example.azure.com/openai/deployments/dep/chat/completions?api-version=2024-01-01",
      );
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
          jsonResponse(500, { error: { type: "server_error" } }),
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
    it("rejects PDFs larger than 25MB without calling fetch", async () => {
      const mock = vi.fn();
      setFetch(mock);
      const extractor = makeExtractor();
      await expect(
        extractor.extract({ bytes: new ArrayBuffer(25 * 1024 * 1024 + 1) }),
      ).rejects.toBeInstanceOf(PDFParseError);
      expect(mock).not.toHaveBeenCalled();
    });
  });

  describe("constructor guards", () => {
    it("rejects empty apiKey", () => {
      expect(
        () => new OpenAIPDFExtractor({ apiKey: "", model: "gpt-4o" }),
      ).toThrow(/apiKey is empty/);
    });

    it("rejects empty model", () => {
      expect(
        () => new OpenAIPDFExtractor({ apiKey: "sk-test", model: "" }),
      ).toThrow(/model is empty/);
    });
  });
});
