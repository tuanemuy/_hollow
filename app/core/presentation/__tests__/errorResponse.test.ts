import { describe, expect, it } from "vitest";
import { SecretBoxErrorCode } from "@/core/domain/adminSettings/ports/secretBox";
import {
  extractSerializedError,
  httpStatusFor,
  redactForClient,
  type SerializedError,
} from "../errorResponse";

// Covers the ADR-006 direct-recognition branch in `extractSerializedError`:
// bare `SerializedError`-shaped objects (e.g. UI code that stored
// `extractSerializedError(e)` in state and later passed it back) must be
// recognised structurally instead of collapsing to `kind: "unknown"`.
describe("extractSerializedError direct-recognition branch (ADR-006)", () => {
  it("returns a bare business SerializedError unchanged", () => {
    const input = {
      kind: "business" as const,
      code: "unsupported_format",
      message: "spec literal",
    };
    const result = extractSerializedError(input);
    expect(result).toEqual(input);
    expect(result.kind).toBe("business");
  });

  it("recognises a bare system SerializedError", () => {
    const input = {
      kind: "system" as const,
      code: null,
      message: "x",
    };
    const result = extractSerializedError(input);
    expect(result.kind).toBe("system");
    expect(result.message).toBe("x");
  });

  it("falls back to unknown when kind is not a recognised SerializedError kind", () => {
    const result = extractSerializedError({ kind: "garbage", message: "x" });
    expect(result.kind).toBe("unknown");
  });

  it("falls back to unknown when message is missing", () => {
    const result = extractSerializedError({ kind: "business" });
    expect(result.kind).toBe("unknown");
  });

  it("falls back to unknown when code/message are absent on an otherwise-valid kind", () => {
    const result = extractSerializedError({ kind: "business", code: "x" });
    expect(result.kind).toBe("unknown");
  });
});

// `secretBox` is a first-class SerializedError variant so a SecretBoxError
// thrown from an admin-gated operation is handled structurally instead of
// collapsing to `kind: "unknown"` (HTTP 500).
describe("secretBox SerializedError variant (W-P-001)", () => {
  const serialized: SerializedError = {
    kind: "secretBox",
    code: SecretBoxErrorCode.KeyUnavailable,
    message: "SECRET_BOX_MASTER_KEY_PREVIOUS is not set",
    retryable: false,
  };

  it("is recognised structurally rather than collapsing to unknown", () => {
    const result = extractSerializedError(serialized);
    expect(result.kind).toBe("secretBox");
    expect(result.code).toBe(SecretBoxErrorCode.KeyUnavailable);
  });

  it("maps to 503 Service Unavailable", () => {
    expect(httpStatusFor(serialized)).toBe(503);
  });

  it("is NOT redacted: code is preserved so the admin recovery hint survives", () => {
    const redacted = redactForClient(serialized);
    expect(redacted.kind).toBe("secretBox");
    expect(redacted.code).toBe(SecretBoxErrorCode.KeyUnavailable);
  });
});
