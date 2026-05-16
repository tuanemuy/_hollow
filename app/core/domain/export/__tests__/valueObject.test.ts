import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { ExportErrorCode } from "../errorCode";
import {
  DateRange,
  ExportFormat,
  ExportJobId,
  ExportOptions,
  ExportProgress,
  ExportScope,
  ExportStatus,
  PdfPaperSize,
  ViewQuerySnapshot,
  validateArtifactKey,
  validateArtifactSize,
  validateErrorCode,
  validateErrorReason,
  validateTtlSec,
} from "../valueObject";

describe("ExportJobId", () => {
  it("throws InvalidId for empty string", () => {
    try {
      ExportJobId.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidId);
      }
    }
  });

  it("throws InvalidId for whitespace-only input", () => {
    try {
      ExportJobId.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("accepts any non-empty string and trims surrounding whitespace", () => {
    const id = ExportJobId.create("  job-1  ");
    expect(id as unknown as string).toBe("job-1");
  });
});

describe("ExportFormat", () => {
  it.each(["html", "markdown", "pdf"] as const)("accepts %s", (raw) => {
    expect(ExportFormat.create(raw)).toBe(raw);
  });

  it("rejects unknown formats", () => {
    try {
      ExportFormat.create("docx");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidFormat);
      }
    }
  });
});

describe("ExportScope", () => {
  it.each(["single", "multiple", "view"] as const)("accepts %s", (raw) => {
    expect(ExportScope.create(raw)).toBe(raw);
  });

  it("rejects unknown scopes", () => {
    try {
      ExportScope.create("everything");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidScope);
      }
    }
  });
});

describe("ExportStatus", () => {
  it.each([
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
    "expired",
  ] as const)("accepts %s", (raw) => {
    expect(ExportStatus.create(raw)).toBe(raw);
  });

  it("rejects unknown statuses", () => {
    try {
      ExportStatus.create("archived");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidStatus);
      }
    }
  });
});

describe("PdfPaperSize", () => {
  it.each(["A4", "Letter"] as const)("accepts %s", (raw) => {
    expect(PdfPaperSize.create(raw)).toBe(raw);
  });

  it("rejects unknown paper sizes", () => {
    try {
      PdfPaperSize.create("Legal");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidPaperSize);
      }
    }
  });
});

describe("ExportOptions", () => {
  it("builds an options bag with given flags", () => {
    const options = ExportOptions.create({
      includeFrontMatter: true,
      embedMedia: false,
      pdfPaperSize: null,
    });
    expect(options.includeFrontMatter).toBe(true);
    expect(options.embedMedia).toBe(false);
    expect(options.pdfPaperSize).toBeNull();
  });

  it("equals returns true when every flag matches", () => {
    const a = ExportOptions.create({
      includeFrontMatter: true,
      embedMedia: true,
      pdfPaperSize: "A4",
    });
    const b = ExportOptions.create({
      includeFrontMatter: true,
      embedMedia: true,
      pdfPaperSize: "A4",
    });
    expect(ExportOptions.equals(a, b)).toBe(true);
  });

  it("equals returns false when paper size differs", () => {
    const a = ExportOptions.create({
      includeFrontMatter: true,
      embedMedia: true,
      pdfPaperSize: "A4",
    });
    const b = ExportOptions.create({
      includeFrontMatter: true,
      embedMedia: true,
      pdfPaperSize: "Letter",
    });
    expect(ExportOptions.equals(a, b)).toBe(false);
  });
});

describe("DateRange", () => {
  it("accepts null endpoints (open range)", () => {
    const range = DateRange.create({ from: null, to: null });
    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
  });

  it("accepts equal endpoints (zero-width range)", () => {
    const at = new Date(1_000);
    const range = DateRange.create({ from: at, to: at });
    expect(range.from?.getTime()).toBe(at.getTime());
    expect(range.to?.getTime()).toBe(at.getTime());
  });

  it("rejects from > to", () => {
    try {
      DateRange.create({ from: new Date(2_000), to: new Date(1_000) });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidDateRange);
      }
    }
  });

  it("equals compares both endpoints", () => {
    const a = DateRange.create({ from: new Date(1), to: new Date(2) });
    const b = DateRange.create({ from: new Date(1), to: new Date(2) });
    const c = DateRange.create({ from: new Date(1), to: null });
    expect(DateRange.equals(a, b)).toBe(true);
    expect(DateRange.equals(a, c)).toBe(false);
  });
});

describe("ViewQuerySnapshot", () => {
  it("normalises keyword whitespace and treats empty as null", () => {
    const q1 = ViewQuerySnapshot.create({
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: "  hello  ",
      referencingNoteId: null,
    });
    expect(q1.keyword).toBe("hello");

    const q2 = ViewQuerySnapshot.create({
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: "   ",
      referencingNoteId: null,
    });
    expect(q2.keyword).toBeNull();
  });

  it("rejects overlong keyword", () => {
    const long = "a".repeat(201);
    try {
      ViewQuerySnapshot.create({
        directoryId: null,
        tagIds: [],
        dateRange: null,
        keyword: long,
        referencingNoteId: null,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidKeyword);
      }
    }
  });

  it("equals compares directoryId, tagIds, dateRange, keyword, referencingNoteId", () => {
    const base = {
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: "k",
      referencingNoteId: null,
    } as const;
    const a = ViewQuerySnapshot.create(base);
    const b = ViewQuerySnapshot.create(base);
    expect(ViewQuerySnapshot.equals(a, b)).toBe(true);

    const c = ViewQuerySnapshot.create({ ...base, keyword: "other" });
    expect(ViewQuerySnapshot.equals(a, c)).toBe(false);
  });
});

describe("ExportProgress", () => {
  it("initial returns 0/0", () => {
    const p = ExportProgress.initial();
    expect(p.processed).toBe(0);
    expect(p.total).toBe(0);
  });

  it("accepts valid (processed <= total) integer pair", () => {
    const p = ExportProgress.create(2, 5);
    expect(p.processed).toBe(2);
    expect(p.total).toBe(5);
  });

  it("rejects negative processed", () => {
    try {
      ExportProgress.create(-1, 0);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidProgress);
      }
    }
  });

  it("rejects non-integer processed", () => {
    try {
      ExportProgress.create(1.5, 2);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("rejects processed > total", () => {
    try {
      ExportProgress.create(5, 3);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});

describe("validateArtifactKey", () => {
  it("rejects empty", () => {
    try {
      validateArtifactKey("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidArtifactKey);
      }
    }
  });

  it("rejects oversized", () => {
    try {
      validateArtifactKey("k".repeat(1025));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("trims whitespace", () => {
    expect(validateArtifactKey("  abc  ")).toBe("abc");
  });
});

describe("validateArtifactSize", () => {
  it("accepts zero and positive integers", () => {
    expect(validateArtifactSize(0)).toBe(0);
    expect(validateArtifactSize(1024)).toBe(1024);
  });

  it("rejects negative", () => {
    try {
      validateArtifactSize(-1);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidArtifactSize);
      }
    }
  });

  it("rejects non-integer", () => {
    try {
      validateArtifactSize(3.14);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});

describe("validateTtlSec", () => {
  it("accepts positive integer", () => {
    expect(validateTtlSec(3600)).toBe(3600);
  });

  it("rejects zero", () => {
    try {
      validateTtlSec(0);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidTtl);
      }
    }
  });

  it("rejects negative", () => {
    try {
      validateTtlSec(-1);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});

describe("validateErrorCode / validateErrorReason", () => {
  it("validateErrorCode trims and rejects empty / overlong", () => {
    expect(validateErrorCode("  some_code  ")).toBe("some_code");
    try {
      validateErrorCode("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidErrorCode);
      }
    }
    try {
      validateErrorCode("a".repeat(129));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("validateErrorReason trims and rejects empty / overlong", () => {
    expect(validateErrorReason("  reason  ")).toBe("reason");
    try {
      validateErrorReason("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ExportErrorCode.InvalidErrorReason);
      }
    }
    try {
      validateErrorReason("r".repeat(1025));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});
