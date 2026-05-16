import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { ExportErrorCode } from "../errorCode";
import {
  DateRange,
  ExportProgress,
  ViewQuerySnapshot,
  validateArtifactKey,
  validateArtifactSize,
  validateTtlSec,
} from "../valueObject";

const KEYWORD_MAX_LENGTH = 200;
const ARTIFACT_KEY_MAX_LENGTH = 1024;

describe("DateRange.create (property)", () => {
  it("accepts any (from, to) where from <= to", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const range = DateRange.create({
            from: new Date(lo),
            to: new Date(hi),
          });
          expect(range.from?.getTime()).toBe(lo);
          expect(range.to?.getTime()).toBe(hi);
        },
      ),
    );
  });

  it("rejects from > to with InvalidDateRange", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          if (lo === hi) return;
          try {
            DateRange.create({ from: new Date(hi), to: new Date(lo) });
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(ExportErrorCode.InvalidDateRange);
            }
          }
        },
      ),
    );
  });
});

describe("ViewQuerySnapshot keyword normalisation (property)", () => {
  it("accepts trimmed length in (0, 200]", () => {
    fc.assert(
      fc.property(
        fc
          .string({
            minLength: 1,
            maxLength: KEYWORD_MAX_LENGTH,
            unit: "grapheme-ascii",
          })
          .map((s) => s.replace(/\s/g, "a"))
          .filter((s) => s.length >= 1 && s.length <= KEYWORD_MAX_LENGTH),
        (raw) => {
          const q = ViewQuerySnapshot.create({
            directoryId: null,
            tagIds: [],
            dateRange: null,
            keyword: raw,
            referencingNoteId: null,
          });
          expect(q.keyword).toBe(raw);
        },
      ),
    );
  });

  it("turns whitespace-only / empty keyword into null", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
            minLength: 0,
            maxLength: 10,
          })
          .map((chars) => chars.join("")),
        (raw) => {
          const q = ViewQuerySnapshot.create({
            directoryId: null,
            tagIds: [],
            dateRange: null,
            keyword: raw,
            referencingNoteId: null,
          });
          expect(q.keyword).toBeNull();
        },
      ),
    );
  });

  it("rejects overlong keyword", () => {
    fc.assert(
      fc.property(fc.integer({ min: 201, max: 500 }), (len) => {
        const raw = "a".repeat(len);
        try {
          ViewQuerySnapshot.create({
            directoryId: null,
            tagIds: [],
            dateRange: null,
            keyword: raw,
            referencingNoteId: null,
          });
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(ExportErrorCode.InvalidKeyword);
          }
        }
      }),
    );
  });
});

describe("ExportProgress (property)", () => {
  it("accepts any integer pair with processed <= total", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (a, b) => {
          const total = Math.max(a, b);
          const processed = Math.min(a, b);
          const p = ExportProgress.create(processed, total);
          expect(p.processed).toBe(processed);
          expect(p.total).toBe(total);
        },
      ),
    );
  });

  it("rejects processed > total", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          if (lo === hi) return;
          try {
            ExportProgress.create(hi, lo);
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(ExportErrorCode.InvalidProgress);
            }
          }
        },
      ),
    );
  });
});

describe("validateArtifactKey (property)", () => {
  it("accepts any non-empty trimmed string up to 1024", () => {
    fc.assert(
      fc.property(
        fc
          .string({
            minLength: 1,
            maxLength: ARTIFACT_KEY_MAX_LENGTH,
            unit: "grapheme-ascii",
          })
          .map((s) => s.replace(/\s/g, "a"))
          .filter(
            (s) => s.trim().length >= 1 && s.length <= ARTIFACT_KEY_MAX_LENGTH,
          ),
        (raw) => {
          const result = validateArtifactKey(raw);
          expect(result.length).toBeGreaterThan(0);
          expect(result.length).toBeLessThanOrEqual(ARTIFACT_KEY_MAX_LENGTH);
        },
      ),
    );
  });

  it("rejects empty / whitespace-only inputs", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
            minLength: 0,
            maxLength: 10,
          })
          .map((chars) => chars.join("")),
        (raw) => {
          try {
            validateArtifactKey(raw);
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
          }
        },
      ),
    );
  });
});

describe("validateArtifactSize (property)", () => {
  it("accepts any non-negative integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (n) => {
        expect(validateArtifactSize(n)).toBe(n);
      }),
    );
  });

  it("rejects negative integers", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: -1 }), (n) => {
        try {
          validateArtifactSize(n);
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
        }
      }),
    );
  });
});

describe("validateTtlSec (property)", () => {
  it("accepts positive integers", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (n) => {
        expect(validateTtlSec(n)).toBe(n);
      }),
    );
  });

  it("rejects zero / negative", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 0 }), (n) => {
        try {
          validateTtlSec(n);
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
        }
      }),
    );
  });
});
