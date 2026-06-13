import { describe, expect, it } from "vitest";
import { sectionFailureReportSchema } from "../sectionFailureReport";

const valid = {
  section: "ノート一覧",
  scope: "page" as const,
  path: "/notes/abc",
  count: 1,
};

describe("sectionFailureReportSchema", () => {
  it("accepts a well-formed report", () => {
    expect(sectionFailureReportSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts the upper boundaries (section 100 / path 2048 / count 1000) and count 1", () => {
    // Exact-max values must pass — guards against an off-by-one in the caps
    // (e.g. `.max(100)` mistyped as `.max(99)`) that reject-only tests miss.
    expect(
      sectionFailureReportSchema.safeParse({
        ...valid,
        section: "x".repeat(100),
        path: "x".repeat(2048),
        count: 1000,
      }).success,
    ).toBe(true);
    expect(
      sectionFailureReportSchema.safeParse({ ...valid, count: 1 }).success,
    ).toBe(true);
  });

  it("accepts an empty path (no .min on path is intentional)", () => {
    expect(
      sectionFailureReportSchema.safeParse({ ...valid, path: "" }).success,
    ).toBe(true);
  });

  it("rejects an empty or over-long section", () => {
    expect(
      sectionFailureReportSchema.safeParse({ ...valid, section: "" }).success,
    ).toBe(false);
    expect(
      sectionFailureReportSchema.safeParse({
        ...valid,
        section: "x".repeat(101),
      }).success,
    ).toBe(false);
  });

  it("rejects a scope outside the enum", () => {
    expect(
      sectionFailureReportSchema.safeParse({ ...valid, scope: "modal" })
        .success,
    ).toBe(false);
  });

  it("rejects an over-long path", () => {
    expect(
      sectionFailureReportSchema.safeParse({
        ...valid,
        path: "x".repeat(2049),
      }).success,
    ).toBe(false);
  });

  it("rejects a non-positive, non-integer, or over-cap count", () => {
    expect(
      sectionFailureReportSchema.safeParse({ ...valid, count: 0 }).success,
    ).toBe(false);
    expect(
      sectionFailureReportSchema.safeParse({ ...valid, count: 1.5 }).success,
    ).toBe(false);
    expect(
      sectionFailureReportSchema.safeParse({ ...valid, count: 1001 }).success,
    ).toBe(false);
  });

  it("rejects missing required keys", () => {
    expect(
      sectionFailureReportSchema.safeParse({ section: "x", scope: "page" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown extra keys (no redacted detail smuggled in)", () => {
    expect(
      sectionFailureReportSchema.safeParse({
        ...valid,
        message: "boom",
        stack: "at ...",
      }).success,
    ).toBe(false);
  });
});
