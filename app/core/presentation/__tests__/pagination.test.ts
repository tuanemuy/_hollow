import { describe, expect, it } from "vitest";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
  PAGINATION_MAX_LIMIT,
  PAGINATION_MAX_PAGE,
  paginationSchema,
  paginationSearchSchema,
} from "../pagination";

describe("paginationSearchSchema (URL `validateSearch` variant)", () => {
  // Issue #215 regression: an empty payload must yield optional `page`
  // / `limit` so `<Link search={{}}>` does not serialize defaults.
  // Loaders re-default at the boundary, not the schema.
  it("leaves `page` / `limit` undefined for an empty object (Issue #215)", () => {
    const parsed = paginationSearchSchema.parse({});
    expect(parsed.page).toBeUndefined();
    expect(parsed.limit).toBeUndefined();
  });

  it("coerces stringly-typed URL values into numbers", () => {
    const parsed = paginationSearchSchema.parse({ page: "3", limit: "50" });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
  });

  it("falls back to undefined for a non-numeric `page` (.catch)", () => {
    const parsed = paginationSearchSchema.parse({ page: "abc" });
    expect(parsed.page).toBeUndefined();
  });

  it("falls back to undefined when `limit` exceeds the cap", () => {
    const parsed = paginationSearchSchema.parse({
      limit: PAGINATION_MAX_LIMIT + 1,
    });
    expect(parsed.limit).toBeUndefined();
  });

  it("falls back to undefined for a non-positive `page`", () => {
    expect(paginationSearchSchema.parse({ page: 0 }).page).toBeUndefined();
    expect(paginationSearchSchema.parse({ page: -1 }).page).toBeUndefined();
  });

  it("accepts the maximum allowed `page` / `limit`", () => {
    const parsed = paginationSearchSchema.parse({
      page: PAGINATION_MAX_PAGE,
      limit: PAGINATION_MAX_LIMIT,
    });
    expect(parsed.page).toBe(PAGINATION_MAX_PAGE);
    expect(parsed.limit).toBe(PAGINATION_MAX_LIMIT);
  });
});

describe("paginationSchema (strict RPC variant)", () => {
  // Pinning the strict-RPC contract: this schema must keep both fields
  // required so server functions reject ambiguous payloads.
  it("throws when `page` is missing", () => {
    expect(() =>
      paginationSchema.parse({ limit: PAGINATION_DEFAULT_LIMIT }),
    ).toThrow();
  });

  it("throws when `limit` is missing", () => {
    expect(() =>
      paginationSchema.parse({ page: PAGINATION_DEFAULT_PAGE }),
    ).toThrow();
  });

  it("throws when `page` / `limit` are not numbers (no coercion)", () => {
    expect(() => paginationSchema.parse({ page: "1", limit: "20" })).toThrow();
  });

  it("accepts well-formed numeric input", () => {
    const parsed = paginationSchema.parse({
      page: PAGINATION_DEFAULT_PAGE,
      limit: PAGINATION_DEFAULT_LIMIT,
    });
    expect(parsed).toEqual({
      page: PAGINATION_DEFAULT_PAGE,
      limit: PAGINATION_DEFAULT_LIMIT,
    });
  });
});
