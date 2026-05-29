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

  // Each of the three union members can carry a non-truthy value; all must
  // collapse to false. Split by member so the union's coverage is explicit.
  it.each([
    ["boolean false", false],
    ["number 0", 0],
    ["string '0'", "0"],
    ["string 'false'", "false"],
    // An arbitrary hand-typed value must not error the route either.
    ["string 'abc'", "abc"],
  ])("collapses %s to false", (_label, value) => {
    expect(
      uploadSearchSchema.parse({ includeDiscarded: value }).includeDiscarded,
    ).toBe(false);
  });

  // `.catch(undefined)` is the belt-and-braces fallback for a value that is
  // present but outside the union (the parse throws, then `.catch` rescues).
  it.each([
    ["an object", { nested: true }],
    ["null", null],
    ["an array", [1]],
  ])("never throws and yields undefined for %s", (_label, value) => {
    let parsed: ReturnType<typeof uploadSearchSchema.parse> | undefined;
    expect(() => {
      parsed = uploadSearchSchema.parse({ includeDiscarded: value });
    }).not.toThrow();
    expect(parsed?.includeDiscarded).toBeUndefined();
  });
});
