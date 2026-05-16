import { describe, expect, it } from "vitest";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { expiresAtToMs, isHeldByOther, shouldRethrow } from "../useEditLock";

function business(code: string): SerializedError {
  return { kind: "business", code, message: code };
}

describe("isHeldByOther", () => {
  it("accepts the canonical `edit_locked_by_other` code", () => {
    expect(isHeldByOther(business("edit_locked_by_other"))).toBe(true);
  });

  it("accepts the legacy `edit_lock_held_by_other` code", () => {
    expect(isHeldByOther(business("edit_lock_held_by_other"))).toBe(true);
  });

  it("rejects other business codes", () => {
    expect(isHeldByOther(business("other"))).toBe(false);
  });

  it("rejects non-business kinds", () => {
    const forbidden: SerializedError = {
      kind: "forbidden",
      code: "NOTE_FORBIDDEN",
      message: "no",
    };
    expect(isHeldByOther(forbidden)).toBe(false);
  });

  it("rejects business with a null/missing code", () => {
    const err: SerializedError = {
      kind: "business",
      code: null,
      message: "x",
    };
    expect(isHeldByOther(err)).toBe(false);
  });
});

describe("shouldRethrow", () => {
  it("re-throws on `forbidden`", () => {
    const err: SerializedError = {
      kind: "forbidden",
      code: null,
      message: "no",
    };
    expect(shouldRethrow(err)).toBe(true);
  });

  it("re-throws on `notFound`", () => {
    const err: SerializedError = {
      kind: "notFound",
      code: null,
      message: "no",
    };
    expect(shouldRethrow(err)).toBe(true);
  });

  it("does not re-throw on `business`", () => {
    expect(shouldRethrow(business("edit_locked_by_other"))).toBe(false);
  });

  it("does not re-throw on `validation`", () => {
    const err: SerializedError = {
      kind: "validation",
      code: null,
      message: "bad",
    };
    expect(shouldRethrow(err)).toBe(false);
  });
});

describe("expiresAtToMs", () => {
  it("parses a valid ISO string into epoch-ms", () => {
    const iso = "2024-01-15T10:00:00.000Z";
    const out = expiresAtToMs(iso);
    expect(out).toBe(Date.parse(iso));
    expect(typeof out).toBe("number");
  });

  it("propagates `null`", () => {
    expect(expiresAtToMs(null)).toBe(null);
  });

  it("collapses unparseable strings to `null` (never NaN)", () => {
    expect(expiresAtToMs("not-a-date")).toBe(null);
    expect(expiresAtToMs("")).toBe(null);
  });
});
