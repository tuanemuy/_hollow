import { afterEach, describe, expect, it, vi } from "vitest";
import { pingOpenAI } from "../connectionPing";

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

const BASE_CONFIG = {
  apiKey: "sk-test",
  model: "gpt-4o-mini",
} as const;

describe("pingOpenAI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("input guards", () => {
    it("returns ok: false when apiKey is empty (after trim)", async () => {
      const result = await pingOpenAI({ ...BASE_CONFIG, apiKey: "   " });
      expect(result).toEqual({ ok: false, reason: "API key is empty" });
    });

    it("returns ok: false when model is empty", async () => {
      const result = await pingOpenAI({ ...BASE_CONFIG, model: "" });
      expect(result).toEqual({ ok: false, reason: "model is empty" });
    });
  });

  describe("success path", () => {
    it("returns ok: true on 2xx", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, {
          choices: [{ message: { role: "assistant", content: "pong" } }],
        }),
      );
      setFetch(mock);

      const result = await pingOpenAI(BASE_CONFIG);
      expect(result).toEqual({ ok: true });

      const [url, init] = mock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({
        authorization: "Bearer sk-test",
        "content-type": "application/json",
      });
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: "gpt-4o-mini",
        max_tokens: 1,
      });
    });

    it("respects a configured baseURL and preserves Azure query parameters", async () => {
      const mock = vi.fn(async () =>
        jsonResponse(200, {
          choices: [{ message: { role: "assistant", content: "pong" } }],
        }),
      );
      setFetch(mock);

      const baseURL =
        "https://res.openai.azure.com/openai/deployments/dep?api-version=2024-02-01";
      const result = await pingOpenAI({ ...BASE_CONFIG, baseURL });
      expect(result).toEqual({ ok: true });

      const [url] = mock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(
        "https://res.openai.azure.com/openai/deployments/dep/chat/completions?api-version=2024-02-01",
      );
    });
  });

  describe("failure mapping", () => {
    it("reports provider error message when the response is non-2xx", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: { type: "invalid_api_key", message: "bad key" },
          }),
        ),
      );
      const result = await pingOpenAI(BASE_CONFIG);
      expect(result).toEqual({
        ok: false,
        reason: "invalid_api_key: bad key",
      });
    });

    it("falls back to the HTTP status when error body is missing", async () => {
      setFetch(
        vi.fn(
          async () =>
            new Response("not json", {
              status: 502,
              headers: { "content-type": "text/plain" },
            }),
        ),
      );
      const result = await pingOpenAI(BASE_CONFIG);
      expect(result).toEqual({ ok: false, reason: "HTTP 502" });
    });

    it("reports timeout reason when fetch is aborted", async () => {
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
      const result = await pingOpenAI({ ...BASE_CONFIG, timeoutMs: 5 });
      expect(result).toMatchObject({ ok: false });
      expect((result as { reason: string }).reason).toMatch(/timed out/);
    });

    it("reports a sanitized network category when fetch throws a TypeError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError("network down");
        }),
      );
      const result = await pingOpenAI(BASE_CONFIG);
      expect(result).toEqual({ ok: false, reason: "network: network down" });
    });

    it("masks Azure ?key=... query parameters embedded in a TypeError", async () => {
      setFetch(
        vi.fn(async () => {
          throw new TypeError(
            "fetch failed at https://res.openai.azure.com/openai/deployments/dep?api-version=2024-02-01&key=fake-secret-xxx",
          );
        }),
      );
      const result = await pingOpenAI({
        ...BASE_CONFIG,
        baseURL:
          "https://res.openai.azure.com/openai/deployments/dep?api-version=2024-02-01",
      });
      expect(result.ok).toBe(false);
      const reason = (result as { reason: string }).reason;
      expect(reason).toContain("network:");
      expect(reason).not.toContain("fake-secret-xxx");
      expect(reason).not.toContain("api-version=2024-02-01");
    });

    it("masks secrets in the 4xx error body message", async () => {
      setFetch(
        vi.fn(async () =>
          jsonResponse(401, {
            error: {
              type: "invalid_api_key",
              message: "key sk-secretvalueabcdef is invalid",
            },
          }),
        ),
      );
      const result = await pingOpenAI(BASE_CONFIG);
      expect(result.ok).toBe(false);
      const reason = (result as { reason: string }).reason;
      expect(reason).toContain("invalid_api_key:");
      expect(reason).not.toContain("sk-secretvalueabcdef");
      expect(reason).toContain("***");
    });
  });
});
