import { describe, expect, it } from "vitest";
import { extractSerializedError } from "../errorResponse";

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
