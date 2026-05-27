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
      const body = JSON.parse(init.body as string) as {
        messages: Array<{ role: string }>;
        system: string;
        model: string;
        max_tokens: number;
      };
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
      // No prefill on the initial request.
      expect(body.messages).toHaveLength(1);
      expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
      expect(init.headers).toMatchObject({
        "content-type": "application/json",
        "x-api-key": "sk-ant-test",
        "anthropic-version": "2023-06-01",
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

    it("structureToHtml: normalises non-string directorySuggestion (e.g. number) to null", async () => {
      setFetch(
        vi.fn(async () =>
          envelopeResponse({
            html: "<p/>",
            titleSuggestion: "T",
            directorySuggestion: 42,
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

    it("structureToHtml: recovers an envelope preceded by prose (parser leniency)", async () => {
      setFetch(
        vi.fn(async () =>
          rawTextResponse(
            'Here is your JSON: {"html":"<p/>","titleSuggestion":"T","directorySuggestion":null}',
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
      expect(result.html).toBe("<p/>");
      expect(mock).toHaveBeenCalledTimes(2);

      const retryBody = parseRequestBody(mock, 1) as {
        system: string;
        messages: Array<{ role: string; content: unknown }>;
      };
      expect(retryBody.system).toContain(
        "Your previous reply was not parseable JSON",
      );
      expect(retryBody.system).toContain("JSON");
      // Anthropic-specific: retry attaches an assistant prefill message
      // at the tail so the model continues from `{`.
      const lastMessage = retryBody.messages[retryBody.messages.length - 1];
      expect(lastMessage).toEqual({ role: "assistant", content: "{" });
    });

    it("does not include the prefill message on the initial request", async () => {
      const mock = vi.fn(async () =>
        envelopeResponse({
          html: "<p/>",
          titleSuggestion: "T",
          directorySuggestion: null,
        }),
      );
      setFetch(mock);
      await makeProvider().structureToHtml(STRUCTURE_INPUT);
      const body = parseRequestBody(mock, 0) as {
        messages: Array<{ role: string }>;
      };
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe("user");
    });

    it("recovers when the prefilled retry returns a `{`-less continuation", async () => {
      // Anthropic API drops the prefill chars from the returned text. The
      // adapter must re-prepend `{` before parsing.
      const mock = vi
        .fn()
        .mockResolvedValueOnce(rawTextResponse("not json"))
        .mockResolvedValueOnce(
          rawTextResponse(
            '"html":"<p/>","titleSuggestion":"T","directorySuggestion":null}',
          ),
        );
      setFetch(mock);

      const result = await makeProvider().structureToHtml(STRUCTURE_INPUT);
      expect(result).toEqual({
        html: "<p/>",
        titleSuggestion: "T",
        directorySuggestion: null,
      });
    });

    it("fails with 'after 1 retry' when both attempts return broken envelopes", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(rawTextResponse("not json"))
        .mockResolvedValueOnce(rawTextResponse("still not json"));
      setFetch(mock);

      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message ===
            "Anthropic response was not a JSON envelope after 1 retry",
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
    it("throws LLMUnavailableError('Anthropic response was not valid JSON') with cause when the HTTP body is non-JSON", async () => {
      setFetch(vi.fn(async () => textResponse(200, "<<not json>>")));
      const provider = makeProvider();
      await expect(provider.structureToHtml(STRUCTURE_INPUT)).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message === "Anthropic response was not valid JSON" &&
          e.cause instanceof Error,
      );
    });

    it("throws LLMUnavailableError with 'after 1 retry' when both attempts return a JSON array body", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(rawTextResponse("[1,2,3]"))
        .mockResolvedValueOnce(rawTextResponse("[1,2,3]"));
      setFetch(mock);
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message ===
            "Anthropic response was not a JSON envelope after 1 retry",
      );
    });

    it("throws LLMUnavailableError with 'after 1 retry' when both replies are JSON null", async () => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(rawTextResponse("null"))
        .mockResolvedValueOnce(rawTextResponse("null"));
      setFetch(mock);
      await expect(
        makeProvider().structureToHtml(STRUCTURE_INPUT),
      ).rejects.toSatisfy(
        (e) =>
          e instanceof LLMUnavailableError &&
          e.message ===
            "Anthropic response was not a JSON envelope after 1 retry",
      );
    });

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
          e.message ===
            "Anthropic response was not a JSON envelope after 1 retry",
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
          e.message ===
            "Anthropic response was not a JSON envelope after 1 retry",
      );
    });
  });
});
