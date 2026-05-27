import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LLMQuotaExceededError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMUnavailableError,
} from "@/core/domain/ingestion/ports/llmProvider";
import { OpenAILLMProvider } from "../llmProvider";

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

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain" },
  });
}

function envelopeResponse(envelope: unknown): Response {
  return jsonResponse(200, {
    choices: [
      { message: { role: "assistant", content: JSON.stringify(envelope) } },
    ],
  });
}

function rawTextResponse(text: string): Response {
  return jsonResponse(200, {
    choices: [{ message: { role: "assistant", content: text } }],
  });
}

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
    baseURL: string;
  }> = {},
): OpenAILLMProvider {
  return new OpenAILLMProvider({
    apiKey: overrides.apiKey ?? "sk-test",
    model: overrides.model ?? "gpt-4o-mini",
    ...(overrides.timeoutMs !== undefined
      ? { timeoutMs: overrides.timeoutMs }
      : {}),
    ...(overrides.baseURL !== undefined ? { baseURL: overrides.baseURL } : {}),
  });
}

function parseRequestBody(mock: FetchMock, callIndex: number): unknown {
  const call = mock.mock.calls[callIndex] as unknown as [unknown, RequestInit];
  return JSON.parse(call[1].body as string);
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

describe("OpenAILLMProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("constructor guards", () => {
    it("rejects empty apiKey", () => {
      expect(
        () =>
          new OpenAILLMProvider({
            apiKey: "",
            model: "gpt-4o-mini",
          }),
      ).toThrow(/apiKey is empty/);
    });

    it("rejects empty model", () => {
      expect(
        () =>
          new OpenAILLMProvider({
            apiKey: "sk-test",
            model: "",
          }),
      ).toThrow(/model is empty/);
    });
  });

  describe("happy path", () => {
    it("structureToHtml: parses JSON envelope and sends a Chat Completions text block", async () => {
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
      const [url, init] = mock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: "gpt-4o-mini",
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: expect.stringContaining(
              "Respond with a single JSON object",
            ),
          },
          {
            role: "user",
            content: [
              { type: "text", text: expect.stringContaining("the raw source") },
            ],
          },
        ],
      });
    });

    it("suggestMetadata: returns parsed envelope with tags / aliases and sends response_format flag", async () => {
      const mock = vi.fn(async () =>
        envelopeResponse({
          tags: ["a", "b"],
          aliases: ["alpha"],
        }),
      );
      setFetch(mock);

      const provider = makeProvider();
      const result = await provider.suggestMetadata(METADATA_INPUT);
      expect(result).toEqual({ tags: ["a", "b"], aliases: ["alpha"] });
      const body = parseRequestBody(mock, 0) as { response_format?: unknown };
      expect(body.response_format).toEqual({ type: "json_object" });
    });

    it("structureToHtml: normalises empty / whitespace directorySuggestion to null", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            html: "<p/>",
            titleSuggestion: "T",
            directorySuggestion: "   ",
          }),
        ),
      );
      const provider = makeProvider();
      const result = await provider.structureToHtml(STRUCTURE_INPUT);
      expect(result.directorySuggestion).toBeNull();
    });

    it("structureToHtml: strips leading/trailing code fence around JSON envelope", async () => {
      setFetch(
        vi.fn(async () =>
          rawTextResponse(
            '```json\n{"html":"<p/>","titleSuggestion":"T","directorySuggestion":null}\n```',
          ),
        ),
      );
      const provider = makeProvider();
      const result = await provider.structureToHtml(STRUCTURE_INPUT);
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
            'Sure, here you go: {"html":"<p/>","titleSuggestion":"T","directorySuggestion":null}',
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

    it("structureToHtml: recovers the head object when the envelope is wrapped in an array", async () => {
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

    it("suggestMetadata: filters non-string entries out of tags / aliases", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            tags: ["a", 1, null, "b"],
            aliases: [true, "x"],
          }),
        ),
      );
      const provider = makeProvider();
      const result = await provider.suggestMetadata(METADATA_INPUT);
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
      expect(result).toEqual({
        html: "<p/>",
        titleSuggestion: "T",
        directorySuggestion: null,
      });
      expect(mock).toHaveBeenCalledTimes(2);

      const retryBody = parseRequestBody(mock, 1) as {
        messages: Array<{ role: string; content: string }>;
        response_format?: unknown;
      };
      const retrySystem = retryBody.messages[0].content;
      expect(retrySystem).toContain(
        "Your previous reply was not parseable JSON",
      );
      expect(retrySystem).toContain("JSON");
      expect(retryBody.response_format).toEqual({ type: "json_object" });
    });

    it("fails with 'after 1 retry' message when both attempts return broken envelopes", async () => {
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
          e.message === "OpenAI response was not a JSON envelope after 1 retry",
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
        .mockResolvedValueOnce(
          jsonResponse(429, { error: { type: "rate_limit" } }),
        );
      setFetch(mock);

      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMRateLimitError);
      expect(mock).toHaveBeenCalledTimes(2);
    });
  });

  describe("empty response → LLMUnavailableError", () => {
    it("throws when choices is empty", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { choices: [] })));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "OpenAI response did not contain any text content",
      );
    });

    it("throws when assistant message content is the empty string", async () => {
      setFetch(vi.fn(async () => rawTextResponse("")));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "OpenAI response did not contain any text content",
      );
    });
  });

  describe("error mapping", () => {
    it("maps HTTP 429 to LLMRateLimitError", async () => {
      setFetch(
        vi.fn(async () => jsonResponse(429, { error: { type: "rate_limit" } })),
      );
      const provider = makeProvider();
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMRateLimitError);
    });

    it("maps HTTP 500 to LLMUnavailableError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(500, {
            error: { type: "server_error", message: "boom" },
          }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMUnavailableError);
    });

    it("maps HTTP 401 to LLMQuotaExceededError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: { type: "invalid_api_key", message: "bad" },
          }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMQuotaExceededError);
    });

    it("maps HTTP 403 to LLMQuotaExceededError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { type: "forbidden", message: "blocked" },
          }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMQuotaExceededError);
    });

    it("maps AbortError to LLMTimeoutError", async () => {
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
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMTimeoutError);
    });
  });

  describe("JSON envelope failures", () => {
    it("throws LLMUnavailableError when the HTTP body is non-JSON", async () => {
      setFetch(vi.fn(async () => textResponse(200, "<<not json>>")));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "OpenAI response was not valid JSON" &&
          e.cause instanceof Error,
      );
    });

    it("throws LLMUnavailableError with 'after 1 retry' when both replies are missing html", async () => {
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
          e.message === "OpenAI response was not a JSON envelope after 1 retry",
      );
      expect(mock).toHaveBeenCalledTimes(2);
    });

    it("throws LLMUnavailableError with 'after 1 retry' when both replies miss titleSuggestion", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(
          envelopeResponse({ html: "<p/>", directorySuggestion: null }),
        )
        .mockResolvedValueOnce(
          envelopeResponse({ html: "<p/>", directorySuggestion: null }),
        );
      setFetch(mock);
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "OpenAI response was not a JSON envelope after 1 retry",
      );
    });

    it("throws LLMUnavailableError with 'after 1 retry' when both replies have non-array tags", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(
          envelopeResponse({ tags: "not an array", aliases: [] }),
        )
        .mockResolvedValueOnce(
          envelopeResponse({ tags: "still not", aliases: [] }),
        );
      setFetch(mock);
      await expect(
        makeProvider().suggestMetadata(METADATA_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "OpenAI response was not a JSON envelope after 1 retry",
      );
    });
  });
});
