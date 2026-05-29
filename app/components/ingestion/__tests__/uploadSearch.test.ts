import { describe, expect, it } from "vitest";
import { uploadSearchSchema } from "../uploadSearch";

describe("uploadSearchSchema", () => {
  it("treats an absent param as undefined (OFF re-defaults at the loader)", () => {
    expect(uploadSearchSchema.parse({}).includeDiscarded).toBeUndefined();
  });

  it("accepts a real boolean true (router.navigate path)", () => {
    expect(
      uploadSearchSchema.parse({ includeDiscarded: true }).includeDiscarded,
    ).toBe(true);
  });

  it("normalises the truthy URL forms to true", () => {
    // TanStack Router's default (JSON) parser turns `?includeDiscarded=1`
    // into the number 1 and `=true` into the boolean true — both must be ON.
    expect(
      uploadSearchSchema.parse({ includeDiscarded: 1 }).includeDiscarded,
    ).toBe(true);
    expect(
      uploadSearchSchema.parse({ includeDiscarded: "1" }).includeDiscarded,
    ).toBe(true);
    expect(
      uploadSearchSchema.parse({ includeDiscarded: "true" }).includeDiscarded,
    ).toBe(true);
  });

  it("collapses non-truthy values to false", () => {
    expect(
      uploadSearchSchema.parse({ includeDiscarded: false }).includeDiscarded,
    ).toBe(false);
    expect(
      uploadSearchSchema.parse({ includeDiscarded: 0 }).includeDiscarded,
    ).toBe(false);
    expect(
      uploadSearchSchema.parse({ includeDiscarded: "0" }).includeDiscarded,
    ).toBe(false);
    expect(
      uploadSearchSchema.parse({ includeDiscarded: "false" }).includeDiscarded,
    ).toBe(false);
    // An arbitrary hand-typed value must not error the route.
    expect(
      uploadSearchSchema.parse({ includeDiscarded: "abc" }).includeDiscarded,
    ).toBe(false);
  });

  it("never throws on an unexpected shape (belt-and-braces .catch)", () => {
    expect(() =>
      uploadSearchSchema.parse({ includeDiscarded: { nested: true } }),
    ).not.toThrow();
  });
});
