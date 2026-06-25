import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { TagMergeJobErrorCode } from "../errorCode";
import {
  TagMergeJobId,
  TagMergeProgress,
  TagMergeStatus,
} from "../valueObject";

describe("TagMergeJobId", () => {
  it("trims and accepts a non-empty id", () => {
    expect(TagMergeJobId.create("  abc  ") as unknown as string).toBe("abc");
  });

  it("rejects an empty id", () => {
    try {
      TagMergeJobId.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagMergeJobErrorCode.InvalidId);
      }
    }
  });
});

describe("TagMergeStatus", () => {
  it("accepts the four valid statuses", () => {
    for (const s of ["pending", "processing", "completed", "failed"]) {
      expect(TagMergeStatus.create(s)).toBe(s);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => TagMergeStatus.create("cancelled")).toThrow();
  });
});

describe("TagMergeProgress", () => {
  it("creates with processed <= total", () => {
    expect(TagMergeProgress.create(3, 10)).toEqual({ processed: 3, total: 10 });
  });

  it("initial is 0/0", () => {
    expect(TagMergeProgress.initial()).toEqual({ processed: 0, total: 0 });
  });

  it("rejects processed > total", () => {
    try {
      TagMergeProgress.create(11, 10);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagMergeJobErrorCode.InvalidProgress);
      }
    }
  });

  it("rejects negative / non-integer counts", () => {
    expect(() => TagMergeProgress.create(-1, 10)).toThrow();
    expect(() => TagMergeProgress.create(1.5, 10)).toThrow();
    expect(() => TagMergeProgress.create(0, -1)).toThrow();
  });
});
