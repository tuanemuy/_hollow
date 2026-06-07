import { describe, expect, it } from "vitest";
import {
  TAG_NAME_MAX_LENGTH,
  tagListParamsSchema,
  tagListSearchSchema,
} from "../schema";

describe("tagListSearchSchema (URL search — Issue #569)", () => {
  it("accepts an empty object and leaves every field undefined", () => {
    const parsed = tagListSearchSchema.parse({});
    expect(parsed.q).toBeUndefined();
    expect(parsed.sort).toBeUndefined();
    expect(parsed.order).toBeUndefined();
  });

  it("passes through valid q / sort / order", () => {
    const parsed = tagListSearchSchema.parse({
      q: "research",
      sort: "lastUsedAt",
      order: "desc",
    });
    expect(parsed).toEqual({
      q: "research",
      sort: "lastUsedAt",
      order: "desc",
    });
  });

  it("trims q", () => {
    expect(tagListSearchSchema.parse({ q: "  hello  " }).q).toBe("hello");
  });

  it("drops a blank q to undefined via .catch (min(1) reject)", () => {
    expect(tagListSearchSchema.parse({ q: "" }).q).toBeUndefined();
    expect(tagListSearchSchema.parse({ q: "   " }).q).toBeUndefined();
  });

  it("drops an over-length q to undefined", () => {
    const tooLong = "a".repeat(TAG_NAME_MAX_LENGTH + 1);
    expect(tagListSearchSchema.parse({ q: tooLong }).q).toBeUndefined();
  });

  it("drops an unknown sort to undefined (.catch)", () => {
    expect(tagListSearchSchema.parse({ sort: "bogus" }).sort).toBeUndefined();
  });

  it("drops an unknown order to undefined (.catch)", () => {
    expect(tagListSearchSchema.parse({ order: "sideways" }).order).toBe(
      undefined,
    );
  });

  it("does not error on a fully malformed search object", () => {
    expect(() =>
      tagListSearchSchema.parse({ q: "", sort: "x", order: 7 }),
    ).not.toThrow();
  });
});

describe("tagListParamsSchema (strict RPC — Issue #569)", () => {
  it("accepts valid values", () => {
    expect(
      tagListParamsSchema.parse({
        q: "essay",
        sort: "noteCount",
        order: "asc",
      }),
    ).toEqual({ q: "essay", sort: "noteCount", order: "asc" });
  });

  it("accepts an empty object (all optional)", () => {
    expect(tagListParamsSchema.parse({})).toEqual({});
  });

  it("rejects an unknown sort loudly (no silent fallback)", () => {
    expect(() => tagListParamsSchema.parse({ sort: "bogus" })).toThrow();
  });

  it("rejects a blank q loudly", () => {
    expect(() => tagListParamsSchema.parse({ q: "" })).toThrow();
  });

  it("accepts all four sort axes including lastUsedAt", () => {
    for (const sort of ["name", "noteCount", "createdAt", "lastUsedAt"]) {
      expect(tagListParamsSchema.parse({ sort }).sort).toBe(sort);
    }
  });
});
