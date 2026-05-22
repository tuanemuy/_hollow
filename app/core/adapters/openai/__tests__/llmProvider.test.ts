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
      const [url, init] = mock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: "gpt-4o-mini",
        max_tokens: 4096,
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

    it("suggestMetadata: returns parsed envelope with tags / aliases", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            tags: ["a", "b"],
            aliases: ["alpha"],
          }),
        ),
      );

      const provider = makeProvider();
      const result = await provider.suggestMetadata(METADATA_INPUT);
      expect(result).toEqual({ tags: ["a", "b"], aliases: ["alpha"] });
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

    it("throws LLMUnavailableError when the text content is not parseable JSON", async () => {
      setFetch(vi.fn(async () => rawTextResponse("not json at all")));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "OpenAI response was not a JSON envelope",
      );
    });

    it("throws LLMUnavailableError when html is missing", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            titleSuggestion: "T",
            directorySuggestion: null,
          }),
        ),
      );
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message.includes('required string field "html"'),
      );
    });

    it("throws LLMUnavailableError when titleSuggestion is missing", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            html: "<p/>",
            directorySuggestion: null,
          }),
        ),
      );
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message.includes('required string field "titleSuggestion"'),
      );
    });

    it("throws LLMUnavailableError when tags is not an array", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            tags: "not an array",
            aliases: [],
          }),
        ),
      );
      const provider = makeProvider();
      await expect(provider.suggestMetadata(METADATA_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message.includes('field "tags" must be an array'),
      );
    });
  });
});
