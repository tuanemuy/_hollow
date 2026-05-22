import { describe, expect, it } from "vitest";
import {
  maskSecrets,
  sanitizeErrorReason,
  toReasonString,
} from "../sanitizeErrorReason";

describe("maskSecrets", () => {
  describe("URL handling", () => {
    it("strips the query string entirely from an HTTPS URL", () => {
      const input =
        "fetch failed at https://example.com/api?key=abcd1234&foo=bar end";
      const out = maskSecrets(input);
      expect(out).toBe("fetch failed at https://example.com/api?… end");
      expect(out).not.toContain("abcd1234");
      expect(out).not.toContain("foo=bar");
    });

    it("preserves a URL without a query string", () => {
      const out = maskSecrets(
        "error at https://api.openai.com/v1/chat/completions :(",
      );
      expect(out).toBe(
        "error at https://api.openai.com/v1/chat/completions :(",
      );
    });

    it("strips Azure ?api-version=...&key=... query strings", () => {
      const input =
        "TypeError: fetch failed at https://res.openai.azure.com/openai/deployments/dep?api-version=2024-02-01&key=xxx";
      const out = maskSecrets(input);
      expect(out).toContain(
        "https://res.openai.azure.com/openai/deployments/dep?…",
      );
      expect(out).not.toContain("api-version");
      expect(out).not.toContain("xxx");
    });

    it("handles a plain HTTP URL", () => {
      const out = maskSecrets(
        "connect to http://localhost:8080/x?token=zzz failed",
      );
      expect(out).toBe("connect to http://localhost:8080/x?… failed");
    });
  });

  describe("Bearer token masking", () => {
    it("replaces `Bearer <token>` with `Bearer ***`", () => {
      expect(maskSecrets("Authorization: Bearer sk-ant-xxx provided")).toBe(
        "Authorization: Bearer *** provided",
      );
    });

    it("matches case-insensitively", () => {
      expect(maskSecrets("bearer abcdef0123 sent")).toBe("bearer *** sent");
    });
  });

  describe("inline secret-bearing key=value masking", () => {
    it("masks `key=<value>` outside URLs (in free text)", () => {
      const out = maskSecrets("config key=fake-secret-xxx, foo=bar");
      expect(out).toContain("key=***");
      expect(out).not.toContain("fake-secret-xxx");
      expect(out).toContain("foo=bar"); // unrelated key remains
    });

    it("masks `api_key=` and `api-key=` variants", () => {
      const out = maskSecrets("got api_key=zzz and api-key=yyy");
      expect(out).toContain("api_key=***");
      expect(out).toContain("api-key=***");
      expect(out).not.toContain("zzz");
      expect(out).not.toContain("yyy");
    });

    it("masks token / password / secret / authorization keys", () => {
      const out = maskSecrets(
        "token=aaa password=bbb secret=ccc authorization=ddd",
      );
      expect(out).toBe("token=*** password=*** secret=*** authorization=***");
    });

    it("masks access_token / access-token", () => {
      expect(maskSecrets("access_token=zzz access-token=yyy")).toBe(
        "access_token=*** access-token=***",
      );
    });
  });

  describe("known provider token prefixes", () => {
    it("replaces standalone `sk-ant-...` tokens with ***", () => {
      const out = maskSecrets("invalid key sk-ant-abcdef01234 supplied");
      expect(out).toBe("invalid key *** supplied");
    });

    it("replaces standalone `AIza...` tokens with ***", () => {
      const out = maskSecrets("Google key AIzaSyABCDEF12345 rejected");
      expect(out).toBe("Google key *** rejected");
    });
  });

  describe("false-positive avoidance", () => {
    it("does NOT mask GUIDs", () => {
      const guid = "550e8400-e29b-41d4-a716-446655440000";
      expect(maskSecrets(`request id ${guid} failed`)).toBe(
        `request id ${guid} failed`,
      );
    });

    it("does NOT mask model names that happen to look long", () => {
      const out = maskSecrets("model gpt-4-turbo-preview unavailable");
      expect(out).toBe("model gpt-4-turbo-preview unavailable");
    });

    it("does NOT mask long URL path segments", () => {
      const out = maskSecrets(
        "POST https://api.example.com/v1/very/deep/path/segment/here ok",
      );
      expect(out).toBe(
        "POST https://api.example.com/v1/very/deep/path/segment/here ok",
      );
    });
  });

  describe("idempotency", () => {
    const inputs = [
      "fetch failed at https://example.com/api?key=abcd1234&foo=bar",
      "Authorization: Bearer sk-ant-xxx",
      "key=fake-secret api_key=other token=last",
      "sk-ant-abcdef01234 and AIzaSyABCDEF12345",
      "plain text without anything secret",
      "",
    ];

    for (const input of inputs) {
      it(`maskSecrets is idempotent for: ${JSON.stringify(input).slice(0, 60)}`, () => {
        const once = maskSecrets(input);
        const twice = maskSecrets(once);
        expect(twice).toBe(once);
      });
    }
  });
});

describe("sanitizeErrorReason", () => {
  describe("category normalization", () => {
    it("returns timeout for AbortError", () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      expect(sanitizeErrorReason(e).category).toBe("timeout");
    });

    it("returns timeout for a DOMException with name=AbortError", () => {
      const e = new DOMException("aborted", "AbortError");
      expect(sanitizeErrorReason(e).category).toBe("timeout");
    });

    it("returns network for a TypeError", () => {
      expect(sanitizeErrorReason(new TypeError("fetch failed")).category).toBe(
        "network",
      );
    });

    it("returns rate_limited for an HTTP 429 message", () => {
      expect(
        sanitizeErrorReason("Anthropic rate limit (HTTP 429)").category,
      ).toBe("rate_limited");
    });

    it("returns quota for a 429 message mentioning quota", () => {
      expect(
        sanitizeErrorReason("OpenAI quota exhausted (HTTP 429)").category,
      ).toBe("quota");
    });

    it("returns auth_failed for an HTTP 401 message", () => {
      expect(
        sanitizeErrorReason("OpenAI auth / quota failure (HTTP 401)").category,
      ).toBe("quota");
      expect(
        sanitizeErrorReason("Unauthorized request (HTTP 401)").category,
      ).toBe("auth_failed");
    });

    it("returns server_error for an HTTP 5xx message", () => {
      expect(
        sanitizeErrorReason("Anthropic upstream failure (HTTP 502)").category,
      ).toBe("server_error");
    });

    it("returns server_error for wording 'internal server error'", () => {
      expect(sanitizeErrorReason("internal server error").category).toBe(
        "server_error",
      );
    });

    it("returns unknown for an unrelated string", () => {
      expect(sanitizeErrorReason("something happened").category).toBe(
        "unknown",
      );
    });
  });

  describe("message masking is applied", () => {
    it("masks the URL query in the message field", () => {
      const result = sanitizeErrorReason(
        new TypeError("fetch failed at https://example.com/api?key=xxx&v=1"),
      );
      expect(result.category).toBe("network");
      expect(result.message).toContain("https://example.com/api?…");
      expect(result.message).not.toContain("xxx");
    });
  });

  describe("non-Error inputs", () => {
    it("does not throw on undefined", () => {
      const result = sanitizeErrorReason(undefined);
      expect(result.category).toBe("unknown");
      expect(result.message).toBe("");
    });

    it("does not throw on null", () => {
      const result = sanitizeErrorReason(null);
      expect(result.category).toBe("unknown");
      expect(result.message).toBe("");
    });

    it("does not throw on a number", () => {
      const result = sanitizeErrorReason(42);
      expect(result.category).toBe("unknown");
      expect(result.message).toBe("42");
    });

    it("does not throw on a plain object with a message field", () => {
      const result = sanitizeErrorReason({ message: "fetch failed" });
      expect(result.message).toBe("fetch failed");
    });

    it("does not throw on an arbitrary plain object", () => {
      const result = sanitizeErrorReason({ foo: "bar" });
      expect(result.category).toBe("unknown");
      expect(result.message).toBe(JSON.stringify({ foo: "bar" }));
    });

    it("does not throw on a plain string", () => {
      const result = sanitizeErrorReason("network down");
      expect(result.category).toBe("network");
      expect(result.message).toBe("network down");
    });
  });

  describe("idempotency", () => {
    it("re-applying sanitize on the same string yields the same message", () => {
      const e = new TypeError(
        "fetch failed at https://example.com/api?key=abcd&v=1",
      );
      const first = sanitizeErrorReason(e);
      const second = sanitizeErrorReason(first.message);
      expect(second.message).toBe(first.message);
    });
  });
});

describe("toReasonString", () => {
  it("combines category and message with `: `", () => {
    expect(
      toReasonString({ category: "network", message: "fetch failed" }),
    ).toBe("network: fetch failed");
  });

  it("returns only the category when the message is empty", () => {
    expect(toReasonString({ category: "unknown", message: "" })).toBe(
      "unknown",
    );
  });
});
