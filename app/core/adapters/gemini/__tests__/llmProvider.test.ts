import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LLMQuotaExceededError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMUnavailableError,
} from "@/core/domain/ingestion/ports/llmProvider";
import { GeminiLLMProvider } from "../llmProvider";

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

function envelopeResponse(envelope: unknown): Response {
  return jsonResponse(200, {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(envelope) }],
        },
      },
    ],
  });
}

function rawTextResponse(text: string): Response {
  return jsonResponse(200, {
    candidates: [{ content: { parts: [{ text }] } }],
  });
}

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
  }> = {},
): GeminiLLMProvider {
  return new GeminiLLMProvider({
    apiKey: overrides.apiKey ?? "AIzaSyTEST",
    model: overrides.model ?? "gemini-1.5-flash",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
  });
}

const STRUCTURE_INPUT = {
  rawText: "the raw source",
  prompt: "",
  locale: "en",
} as const;

const METADATA_INPUT = {
  html: "<p>body</p>",
  prompt: "",
} as const;

describe("GeminiLLMProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("constructor guards", () => {
    it("rejects empty apiKey", () => {
      expect(
        () =>
          new GeminiLLMProvider({
            apiKey: "",
            model: "gemini-1.5-flash",
          }),
      ).toThrow(/apiKey is empty/);
    });

    it("rejects empty model", () => {
      expect(
        () =>
          new GeminiLLMProvider({
            apiKey: "AIzaSyTEST",
            model: "",
          }),
      ).toThrow(/model is empty/);
    });
  });

  describe("happy path", () => {
    it("structureToHtml: returns parsed envelope and sends a text part via the helper", async () => {
      const mock = vi.fn(async () =>
        envelopeResponse({
          html: "<p>hi</p>",
          titleSuggestion: "Hello",
          directorySuggestion: "inbox",
        }),
      );
      setFetch(mock);

      const provider = makeProvider();
      const result = await provider.structureToHtml(STRUCTURE_INPUT);

      expect(result).toEqual({
        html: "<p>hi</p>",
        titleSuggestion: "Hello",
        directorySuggestion: "inbox",
      });
      expect(mock).toHaveBeenCalledTimes(1);
      const call = mock.mock.calls[0] as unknown as [string, RequestInit];
      const url = call[0];
      const init = call[1];

      // Auth header carries the API key; URL does not.
      expect(init.headers).toMatchObject({
        "content-type": "application/json",
        "x-goog-api-key": "AIzaSyTEST",
      });
      expect(url).not.toContain("AIzaSyTEST");
      expect(url).not.toContain("key=");

      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        contents: [
          {
            role: "user",
            parts: [{ text: expect.stringContaining("the raw source") }],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: expect.stringContaining(
                "Respond with a single JSON object",
              ),
            },
          ],
        },
        generationConfig: {
          maxOutputTokens: 4096,
        },
      });
    });

    it("suggestMetadata: returns parsed envelope with tags / aliases", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({ tags: ["a", "b"], aliases: ["alpha"] }),
        ),
      );
      const provider = makeProvider();
      const result = await provider.suggestMetadata(METADATA_INPUT);
      expect(result).toEqual({ tags: ["a", "b"], aliases: ["alpha"] });
    });

    it("structureToHtml: normalises null directorySuggestion to null", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            html: "<p/>",
            titleSuggestion: "T",
            directorySuggestion: null,
          }),
        ),
      );
      const result = await makeProvider().structureToHtml(STRUCTURE_INPUT);
      expect(result.directorySuggestion).toBeNull();
    });

    it("structureToHtml: normalises whitespace-only directorySuggestion to null", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            html: "<p/>",
            titleSuggestion: "T",
            directorySuggestion: "   ",
          }),
        ),
      );
      const result = await makeProvider().structureToHtml(STRUCTURE_INPUT);
      expect(result.directorySuggestion).toBeNull();
    });

    it("structureToHtml: strips a leading/trailing code fence around the JSON envelope", async () => {
      setFetch(
        vi.fn(async () =>
          rawTextResponse(
            '```json\n{"html":"<p/>","titleSuggestion":"T","directorySuggestion":null}\n```',
          ),
        ),
      );
      const result = await makeProvider().structureToHtml(STRUCTURE_INPUT);
      expect(result).toEqual({
        html: "<p/>",
        titleSuggestion: "T",
        directorySuggestion: null,
      });
    });

    it("suggestMetadata: filters non-string entries out of tags / aliases arrays", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            tags: ["a", 1, null, "b"],
            aliases: [true, "x"],
          }),
        ),
      );
      const result = await makeProvider().suggestMetadata(METADATA_INPUT);
      expect(result).toEqual({ tags: ["a", "b"], aliases: ["x"] });
    });
  });

  describe("empty response → LLMUnavailableError", () => {
    it("throws when candidates is empty", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { candidates: [] })));
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Gemini response did not contain any text content",
      );
    });

    it("throws when parts array is empty", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, {
            candidates: [{ content: { parts: [] } }],
          }),
        ),
      );
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Gemini response did not contain any text content",
      );
    });

    it("throws when the single text part is empty", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, {
            candidates: [{ content: { parts: [{ text: "" }] } }],
          }),
        ),
      );
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Gemini response did not contain any text content",
      );
    });
  });

  describe("error mapping", () => {
    it("maps HTTP 429 to LLMRateLimitError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } }),
        ),
      );
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMRateLimitError);
    });

    it("maps HTTP 500 to LLMUnavailableError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, { error: { status: "INTERNAL", message: "boom" } }),
        ),
      );
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMUnavailableError);
    });

    it("maps HTTP 401 to LLMQuotaExceededError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: { status: "UNAUTHENTICATED", message: "bad key" },
          }),
        ),
      );
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMQuotaExceededError);
    });

    it("maps HTTP 403 to LLMQuotaExceededError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { status: "PERMISSION_DENIED", message: "no" },
          }),
        ),
      );
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMQuotaExceededError);
    });

    it("maps AbortError (timeout) to LLMTimeoutError", async () => {
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
        makeProvider({ timeoutMs: 5 }).structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMTimeoutError);
    });

    it("maps fetch TypeError to LLMUnavailableError with the TypeError as cause", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMUnavailableError);
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toMatchObject({ cause: expect.any(TypeError) });
    });
  });

  describe("JSON envelope failures", () => {
    it("throws LLMUnavailableError when the text is not parseable JSON", async () => {
      setFetch(vi.fn(async () => rawTextResponse("not json at all")));
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Gemini response was not a JSON envelope" &&
          e.cause instanceof Error,
      );
    });

    it("throws LLMUnavailableError when html is missing", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({ titleSuggestion: "T", directorySuggestion: null }),
        ),
      );
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message.includes('required string field "html"'),
      );
    });

    it("throws LLMUnavailableError when tags is not an array", async () => {
      setFetch(
        vi.fn(async () => envelopeResponse({ tags: "nope", aliases: [] })),
      );
      await expect(
        makeProvider().suggestMetadata(METADATA_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message.includes('field "tags" must be an array'),
      );
    });
  });
});
