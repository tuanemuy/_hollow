import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AnthropicErrorMapper,
  arrayBufferToBase64,
  callAnthropicMessages,
} from "../messagesClient";

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

class RateLimitErr extends Error {
  override readonly name = "RateLimitErr";
}
class UnavailableErr extends Error {
  override readonly name = "UnavailableErr";
}
class TimeoutErr extends Error {
  override readonly name = "TimeoutErr";
}
class QuotaErr extends Error {
  override readonly name = "QuotaErr";
}

const mapper: AnthropicErrorMapper = {
  rateLimit: (m, cause) => new RateLimitErr(m, cause as ErrorOptions),
  unavailable: (m, cause) => new UnavailableErr(m, cause as ErrorOptions),
  timeout: (m, cause) => new TimeoutErr(m, cause as ErrorOptions),
  quota: (m, cause) => new QuotaErr(m, cause as ErrorOptions),
};

const BASE_CONFIG = {
  apiKey: "sk-ant-test",
  model: "claude-3-5-haiku-latest",
} as const;

describe("callAnthropicMessages detailSuffix masking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("masks secrets in the provider 4xx error body before embedding it into the thrown message", async () => {
    setFetch(
      vi.fn(async () =>
        jsonResponse(429, {
          error: {
            type: "rate_limit",
            message:
              "slow down at https://api.anthropic.com/v1/messages?key=fake-secret-xxx",
          },
        }),
      ),
    );
    try {
      await callAnthropicMessages(
        BASE_CONFIG,
        "sys",
        [{ type: "text", text: "x" }],
        mapper,
      );
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitErr);
      const message = (e as Error).message;
      expect(message).not.toContain("fake-secret-xxx");
      expect(message).toContain("https://api.anthropic.com/v1/messages?…");
    }
  });
});

function roundTrip(buffer: ArrayBuffer): Uint8Array {
  const base64 = arrayBufferToBase64(buffer);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function makeRandomBuffer(size: number): ArrayBuffer {
  const bytes = new Uint8Array(size);
  // Deterministic pseudo-random: keep the test reproducible without
  // pulling in a seedable RNG.
  for (let i = 0; i < size; i++) {
    bytes[i] = (i * 2654435761) & 0xff;
  }
  return bytes.buffer;
}

describe("arrayBufferToBase64", () => {
  it("returns an empty string for an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  it("round-trips at one byte below the 8KB chunk boundary (8191)", () => {
    const buffer = makeRandomBuffer(8191);
    const decoded = roundTrip(buffer);
    expect(decoded).toEqual(new Uint8Array(buffer));
  });

  it("round-trips exactly at the 8KB chunk boundary (8192)", () => {
    const buffer = makeRandomBuffer(8192);
    const decoded = roundTrip(buffer);
    expect(decoded).toEqual(new Uint8Array(buffer));
  });

  it("round-trips at one byte past the 8KB chunk boundary (8193)", () => {
    const buffer = makeRandomBuffer(8193);
    const decoded = roundTrip(buffer);
    expect(decoded).toEqual(new Uint8Array(buffer));
  });

  it("round-trips a 100KB buffer (many chunks)", () => {
    const buffer = makeRandomBuffer(100 * 1024);
    const decoded = roundTrip(buffer);
    expect(decoded).toEqual(new Uint8Array(buffer));
  });

  it("preserves Latin-1 byte semantics for 0x80..0xFF", () => {
    const bytes = new Uint8Array(128);
    for (let i = 0; i < 128; i++) {
      bytes[i] = 0x80 + i;
    }
    const decoded = roundTrip(bytes.buffer);
    expect(decoded).toEqual(bytes);
  });
});
