import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LLMQuotaExceededError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMUnavailableError,
} from "@/core/domain/ingestion/ports/llmProvider";
import { AnthropicLLMProvider } from "../llmProvider";

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
    content: [{ type: "text", text: JSON.stringify(envelope) }],
  });
}

function rawTextResponse(text: string): Response {
  return jsonResponse(200, {
    content: [{ type: "text", text }],
  });
}

function makeProvider(
  overrides: Partial<{
    apiKey: string;
    model: string;
    timeoutMs: number;
  }> = {},
): AnthropicLLMProvider {
  return new AnthropicLLMProvider({
    apiKey: overrides.apiKey ?? "sk-ant-test",
    model: overrides.model ?? "claude-3-5-sonnet-latest",
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

describe("AnthropicLLMProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("constructor guards", () => {
    it("rejects empty apiKey", () => {
      expect(
        () =>
          new AnthropicLLMProvider({
            apiKey: "",
            model: "claude-3-5-sonnet-latest",
          }),
      ).toThrow(/apiKey is empty/);
    });

    it("rejects empty model", () => {
      expect(
        () =>
          new AnthropicLLMProvider({
            apiKey: "sk-ant-test",
            model: "",
          }),
      ).toThrow(/model is empty/);
    });
  });

  describe("happy path", () => {
    it("structureToHtml: returns parsed envelope and sends a text content block via the helper", async () => {
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
      const call = mock.mock.calls[0] as unknown as [unknown, RequestInit];
      const init = call[1];
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 4096,
        system: expect.stringContaining("Respond with a single JSON object"),
        messages: [
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
      const provider = makeProvider();
      const result = await provider.structureToHtml(STRUCTURE_INPUT);
      expect(result.directorySuggestion).toBeNull();
    });

    it("structureToHtml: normalises empty-string directorySuggestion to null", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            html: "<p/>",
            titleSuggestion: "T",
            directorySuggestion: "",
          }),
        ),
      );
      const provider = makeProvider();
      const result = await provider.structureToHtml(STRUCTURE_INPUT);
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
      const provider = makeProvider();
      const result = await provider.structureToHtml(STRUCTURE_INPUT);
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
      const provider = makeProvider();
      const result = await provider.structureToHtml(STRUCTURE_INPUT);
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
      const provider = makeProvider();
      const result = await provider.suggestMetadata(METADATA_INPUT);
      expect(result).toEqual({ tags: ["a", "b"], aliases: ["x"] });
    });
  });

  describe("empty response → LLMUnavailableError (port-specific override of helper contract)", () => {
    it("throws when content is an empty array", async () => {
      setFetch(vi.fn(async () => jsonResponse(200, { content: [] })));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Anthropic response did not contain any text content",
      );
    });

    it("throws when content has only non-text blocks", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, { content: [{ type: "tool_use", id: "x" }] }),
        ),
      );
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Anthropic response did not contain any text content",
      );
    });

    it("throws when the single text block is an empty string", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(200, { content: [{ type: "text", text: "" }] }),
        ),
      );
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Anthropic response did not contain any text content",
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
          jsonResponse(500, { error: { type: "api_error", message: "boom" } }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMUnavailableError);
    });

    it("maps HTTP 403 + permission_error to LLMQuotaExceededError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { type: "permission_error", message: "no access" },
          }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMQuotaExceededError);
    });

    it("maps HTTP 403 + quota/credit/billing message to LLMQuotaExceededError", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(403, {
            error: { type: "forbidden", message: "credit balance is too low" },
          }),
        ),
      );
      const provider = makeProvider();
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMQuotaExceededError);
    });

    it("maps HTTP 403 + other detail to LLMUnavailableError", async () => {
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
      ).rejects.toBeInstanceOf(LLMUnavailableError);
    });

    it("maps fetch TypeError to LLMUnavailableError with the TypeError as cause", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      const provider = makeProvider();
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMUnavailableError);
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toMatchObject({ cause: expect.any(TypeError) });
    });

    it("maps an unexpected non-AbortError / non-TypeError throw to LLMUnavailableError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new RangeError("boom");
        }),
      );
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message.startsWith("Unexpected error while calling Anthropic"),
      );
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
      const provider = makeProvider({ timeoutMs: 5 });
      await expect(
        provider.structureToHtml(STRUCTURE_INPUT),
      ).rejects.toBeInstanceOf(LLMTimeoutError);
    });
  });

  describe("JSON envelope / response body failures", () => {
    it("throws LLMUnavailableError('Anthropic response was not valid JSON') when the HTTP body is non-JSON", async () => {
      setFetch(vi.fn(async () => textResponse(200, "<<not json>>")));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Anthropic response was not valid JSON",
      );
    });

    it("throws LLMUnavailableError when the text block is not parseable JSON", async () => {
      setFetch(vi.fn(async () => rawTextResponse("not json at all")));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Anthropic response was not a JSON envelope",
      );
    });

    it("throws LLMUnavailableError when the envelope is a JSON array", async () => {
      setFetch(vi.fn(async () => rawTextResponse("[1,2,3]")));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Anthropic response was not a JSON envelope",
      );
    });

    it("throws LLMUnavailableError when the envelope is JSON null", async () => {
      setFetch(vi.fn(async () => rawTextResponse("null")));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Anthropic response was not a JSON envelope",
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

    it("throws LLMUnavailableError when aliases is not an array", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            tags: [],
            aliases: { not: "an array" },
          }),
        ),
      );
      const provider = makeProvider();
      await expect(provider.suggestMetadata(METADATA_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message.includes('field "aliases" must be an array'),
      );
    });
  });
});
