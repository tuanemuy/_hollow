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

function parseRequestBody(mock: FetchMock, callIndex: number): unknown {
  const call = mock.mock.calls[callIndex] as unknown as [unknown, RequestInit];
  return JSON.parse(call[1].body as string);
}

const STRUCTURE_INPUT = {
  rawText: "the raw source",
  prompt: "",
  titlePrompt: "",
  directoryPrompt: "",
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
          responseMimeType: "application/json",
        },
      });
    });

    it("suggestMetadata: returns parsed envelope and sends responseMimeType flag", async () => {
      const mock = vi.fn(async () =>
        envelopeResponse({ tags: ["a", "b"], aliases: ["alpha"] }),
      );
      setFetch(mock);
      const result = await makeProvider().suggestMetadata(METADATA_INPUT);
      expect(result).toEqual({ tags: ["a", "b"], aliases: ["alpha"] });
      const body = parseRequestBody(mock, 0) as {
        generationConfig: { responseMimeType?: string };
      };
      expect(body.generationConfig.responseMimeType).toBe("application/json");
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

    it("structureToHtml: recovers an envelope preceded by prose (parser leniency)", async () => {
      setFetch(
        vi.fn(async () =>
          rawTextResponse(
            'Of course: {"html":"<p/>","titleSuggestion":"T","directorySuggestion":null}',
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

    it("structureToHtml: recovers the head object when wrapped in an array", async () => {
      setFetch(
        vi.fn(async () =>
          rawTextResponse(
            '[{"html":"<p/>","titleSuggestion":"T","directorySuggestion":null}]',
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

  describe("retry on broken envelope", () => {
    it("recovers when the first reply is non-JSON and the retry returns a valid envelope", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(rawTextResponse("not json at all"))
        .mockResolvedValueOnce(
          envelopeResponse({
            html: "<p/>",
            titleSuggestion: "T",
            directorySuggestion: null,
          }),
        );
      setFetch(mock);

      const result = await makeProvider().structureToHtml(STRUCTURE_INPUT);
      expect(result.html).toBe("<p/>");
      expect(mock).toHaveBeenCalledTimes(2);

      const retryBody = parseRequestBody(mock, 1) as {
        systemInstruction: { parts: Array<{ text: string }> };
        generationConfig: { responseMimeType?: string };
      };
      const retrySystem = retryBody.systemInstruction.parts[0].text;
      expect(retrySystem).toContain(
        "Your previous reply was not parseable JSON",
      );
      expect(retrySystem).toContain("JSON");
      expect(retryBody.generationConfig.responseMimeType).toBe(
        "application/json",
      );
    });

    it("fails with 'after 1 retry' when both attempts return broken envelopes", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(rawTextResponse("not json at all"))
        .mockResolvedValueOnce(rawTextResponse("still not json"));
      setFetch(mock);

      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Gemini response was not a JSON envelope after 1 retry",
      );
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("retries when required keys are missing on the first reply", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(
          envelopeResponse({ titleSuggestion: "T", directorySuggestion: null }),
        )
        .mockResolvedValueOnce(
          envelopeResponse({
            html: "<p/>",
            titleSuggestion: "T",
            directorySuggestion: null,
          }),
        );
      setFetch(mock);
      const result = await makeProvider().structureToHtml(STRUCTURE_INPUT);
      expect(result.html).toBe("<p/>");
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("suggestMetadata: recovers when the first reply has non-array tags", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(
          envelopeResponse({ tags: "not an array", aliases: [] }),
        )
        .mockResolvedValueOnce(
          envelopeResponse({ tags: ["a", "b"], aliases: ["x"] }),
        );
      setFetch(mock);
      const result = await makeProvider().suggestMetadata(METADATA_INPUT);
      expect(result).toEqual({ tags: ["a", "b"], aliases: ["x"] });
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("propagates LLMRateLimitError thrown on the retry instead of wrapping it", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(rawTextResponse("not json at all"))
        .mockResolvedValueOnce(jsonResponse(429, { error: { message: "rl" } }));
      setFetch(mock);
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMRateLimitError);
      expect(mock).toHaveBeenCalledTimes(2);
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
    it("throws LLMUnavailableError with 'after 1 retry' when both replies miss html", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(
          envelopeResponse({ titleSuggestion: "T", directorySuggestion: null }),
        )
        .mockResolvedValueOnce(
          envelopeResponse({ titleSuggestion: "T", directorySuggestion: null }),
        );
      setFetch(mock);
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Gemini response was not a JSON envelope after 1 retry",
      );
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("throws LLMUnavailableError with 'after 1 retry' when both replies have non-array tags", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(envelopeResponse({ tags: "nope", aliases: [] }))
        .mockResolvedValueOnce(
          envelopeResponse({ tags: "still nope", aliases: [] }),
        );
      setFetch(mock);
      await expect(
        makeProvider().suggestMetadata(METADATA_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Gemini response was not a JSON envelope after 1 retry",
      );
    });
  });
});
