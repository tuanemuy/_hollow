import { describe, expect, it } from "vitest";
import { generateShareLinkToken, hashShareLinkToken } from "../token";

const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;

describe("generateShareLinkToken", () => {
  it("produces a URL-safe base64 string with no padding", () => {
    const token = generateShareLinkToken();
    expect(token).toMatch(BASE64_URL_PATTERN);
    expect(token.includes("=")).toBe(false);
    expect(token.includes("+")).toBe(false);
    expect(token.includes("/")).toBe(false);
  });

  it("produces a different token on each call (CSPRNG)", () => {
    const a = generateShareLinkToken();
    const b = generateShareLinkToken();
    expect(a).not.toBe(b);
  });

  it("respects a custom byte length within the allowed range", () => {
    // base64 of N bytes is ceil(4 * N / 3) characters before padding strip.
    // For 16 bytes that is 22; for 64 bytes that is 86.
    const short = generateShareLinkToken(16);
    const long = generateShareLinkToken(64);
    expect(short.length).toBe(22);
    expect(long.length).toBe(86);
  });

  it.each([
    0,
    8,
    15,
    65,
    100,
    1.5,
    Number.NaN,
  ])("rejects an out-of-range or non-integer byte length: %s", (n) => {
    expect(() => generateShareLinkToken(n)).toThrow(RangeError);
  });
});

describe("hashShareLinkToken", () => {
  it("is deterministic for the same input", async () => {
    const a = await hashShareLinkToken("hello");
    const b = await hashShareLinkToken("hello");
    expect(a).toBe(b);
  });

  it("differs for different inputs", async () => {
    const a = await hashShareLinkToken("hello");
    const b = await hashShareLinkToken("hellp");
    expect(a).not.toBe(b);
  });

  it("produces a URL-safe base64 string with no padding", async () => {
    const hash = await hashShareLinkToken("anything");
    expect(hash).toMatch(BASE64_URL_PATTERN);
    expect(hash.includes("=")).toBe(false);
  });

  it("produces a 43-character base64 string (SHA-256 = 32 bytes → 43 chars unpadded)", async () => {
    const hash = await hashShareLinkToken("any-token");
    expect(hash.length).toBe(43);
  });
});
