import { afterEach, describe, expect, it, vi } from "vitest";
import type { LLMConfig } from "@/core/domain/adminSettings/valueObject";
import { pingAnthropic } from "../connectionPing";

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

// `pingAnthropic` only reads `cfg.model` (and asserts the URL/headers
// elsewhere); the rest of `LLMConfig` is irrelevant. Cast through
// `unknown` so we don't have to construct a full value-object.
const CFG = {
  provider: "anthropic" as const,
  model: "claude-3-5-haiku-latest",
} as unknown as LLMConfig;

describe("pingAnthropic", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns { ok: true } on a 2xx response and sends the API key via the x-api-key header", async () => {
    const mock = vi.fn(async () => jsonResponse(200, { id: "msg_x" }));
    setFetch(mock);

    const result = await pingAnthropic(CFG, "sk-ant-test", 5000);
    expect(result).toEqual({ ok: true });

    const call = mock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
    });

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
  });

  it("returns { ok: false, error } with `<type>: <message>` on a 401 with a parsable error body", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(401, {
          error: {
            type: "authentication_error",
            message: "invalid x-api-key",
          },
        }),
      ),
    );

    const result = await pingAnthropic(CFG, "sk-ant-bad", 5000);
    expect(result).toEqual({
      ok: false,
      error: "authentication_error: invalid x-api-key",
    });
  });

  it("falls back to the HTTP status when the error body cannot be parsed", async () => {
    setFetch(
      vi.fn(
        async () =>
          new Response("upstream broke", {
            status: 502,
            headers: { "content-type": "text/plain" },
          }),
      ),
    );

    const result = await pingAnthropic(CFG, "sk-ant-test", 5000);
    expect(result).toEqual({ ok: false, error: "HTTP 502" });
  });

  it("reports a timeout error when fetch is aborted", async () => {
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

    const result = await pingAnthropic(CFG, "sk-ant-test", 5);
    expect(result).toEqual({
      ok: false,
      error: "Request timed out after 5ms",
    });
  });

  it("never throws on a network TypeError; reports a sanitized network category", async () => {
    setFetch(
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const result = await pingAnthropic(CFG, "sk-ant-test", 5000);
    expect(result).toEqual({ ok: false, error: "network: fetch failed" });
  });

  it("masks secrets embedded in a TypeError message and tags it as network", async () => {
    setFetch(
      vi.fn(async () => {
        throw new TypeError(
          "fetch failed at https://api.anthropic.com/v1/messages?key=fake-secret-xxx",
        );
      }),
    );

    const result = await pingAnthropic(CFG, "sk-ant-test", 5000);
    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain("network:");
    expect(error).not.toContain("fake-secret-xxx");
    expect(error).toContain("https://api.anthropic.com/v1/messages?…");
  });

  it("masks secrets in the 4xx error body message", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(401, {
          error: {
            type: "authentication_error",
            message: "invalid key sk-ant-secretvalue1234",
          },
        }),
      ),
    );

    const result = await pingAnthropic(CFG, "sk-ant-bad", 5000);
    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain("authentication_error:");
    expect(error).not.toContain("sk-ant-secretvalue1234");
    expect(error).toContain("***");
  });
});
