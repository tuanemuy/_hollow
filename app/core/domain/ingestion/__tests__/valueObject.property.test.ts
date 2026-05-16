import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "../errorCode";
import {
  IngestionJobId,
  IngestionLimits,
  MimeType,
  OriginalFileName,
  RegenerationCount,
  SourceFileKind,
  TempStorageKey,
  validateByteSize,
  validateErrorReason,
  validateFailureCode,
} from "../valueObject";

const ORIGINAL_FILE_NAME_MAX = 255;
const TEMP_STORAGE_KEY_MAX = 1024;
const ERROR_REASON_MAX = 2048;
const ERROR_CODE_MAX = 128;

const whitespaceArb = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
    minLength: 0,
    maxLength: 10,
  })
  .map((chars) => chars.join(""));

describe("IngestionJobId (property)", () => {
  it("accepts non-empty trimmed strings and is idempotent under trim", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 80 })
          .filter((s) => s.trim().length > 0),
        (raw) => {
          const id = IngestionJobId.create(raw);
          expect(id as unknown as string).toBe(raw.trim());
        },
      ),
    );
  });

  it("rejects empty / whitespace inputs", () => {
    fc.assert(
      fc.property(whitespaceArb, (raw) => {
        try {
          IngestionJobId.create(raw);
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(IngestionErrorCode.InvalidId);
          }
        }
      }),
    );
  });
});

describe("OriginalFileName (property)", () => {
  it("accepts non-empty trimmed strings up to 255 chars", () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[A-Za-z0-9_\-. ]{1,255}$/)
          .filter((s) => s.trim().length >= 1 && s.trim().length <= 255),
        (raw) => {
          const name = OriginalFileName.create(raw);
          expect(name as unknown as string).toBe(raw.trim());
        },
      ),
    );
  });

  it("rejects whitespace-only and over-length inputs", () => {
    fc.assert(
      fc.property(whitespaceArb, (raw) => {
        try {
          OriginalFileName.create(raw);
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
        }
      }),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: ORIGINAL_FILE_NAME_MAX + 1, max: 600 }),
        (n) => {
          try {
            OriginalFileName.create("a".repeat(n));
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(IngestionErrorCode.InvalidFileName);
            }
          }
        },
      ),
    );
  });
});

describe("MimeType (property)", () => {
  it("accepts conforming mime forms", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9_.+-]{1,40}\/[A-Za-z0-9_.+-]{1,40}$/),
        (raw) => {
          const mime = MimeType.create(raw);
          expect(mime as unknown as string).toBe(raw);
        },
      ),
    );
  });

  it("rejects strings with no slash", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9]{1,32}$/), (raw) => {
        try {
          MimeType.create(raw);
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(IngestionErrorCode.InvalidMimeType);
          }
        }
      }),
    );
  });
});

describe("TempStorageKey (property)", () => {
  it("accepts non-empty trimmed inputs up to 1024 chars", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9/_\-.]{1,200}$/), (raw) => {
        const key = TempStorageKey.create(raw);
        expect(key as unknown as string).toBe(raw.trim());
      }),
    );
  });

  it("rejects over-length keys", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: TEMP_STORAGE_KEY_MAX + 1, max: 2000 }),
        (n) => {
          try {
            TempStorageKey.create("k".repeat(n));
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
          }
        },
      ),
    );
  });
});

describe("RegenerationCount (property)", () => {
  it("next() monotonically increases by exactly 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (n) => {
        const c = RegenerationCount.create(n);
        const next = RegenerationCount.next(c);
        expect(next as number).toBe(n + 1);
      }),
    );
  });

  it("rejects any non-integer or negative value", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -1000, max: -1 }),
          fc.double({ noNaN: true }).filter((n) => !Number.isInteger(n)),
        ),
        (n) => {
          try {
            RegenerationCount.create(n);
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(
                IngestionErrorCode.InvalidRegenerationCount,
              );
            }
          }
        },
      ),
    );
  });
});

describe("validateErrorReason / validateFailureCode (property)", () => {
  it("accepts non-empty trimmed inputs", () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[A-Za-z0-9_.\- ]{1,100}$/)
          .filter((s) => s.trim().length > 0),
        (raw) => {
          expect(validateErrorReason(raw)).toBe(raw.trim());
          expect(validateFailureCode(raw)).toBe(raw.trim());
        },
      ),
    );
  });

  it("rejects over-length reason", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: ERROR_REASON_MAX + 1, max: ERROR_REASON_MAX + 200 }),
        (n) => {
          try {
            validateErrorReason("a".repeat(n));
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
          }
        },
      ),
    );
  });

  it("rejects over-length code", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: ERROR_CODE_MAX + 1, max: ERROR_CODE_MAX + 100 }),
        (n) => {
          try {
            validateFailureCode("a".repeat(n));
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
          }
        },
      ),
    );
  });
});

describe("validateByteSize (property)", () => {
  it("accepts any non-negative integer below the cap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1024 * 1024 * 1024 }), (n) => {
        expect(validateByteSize(n)).toBe(n);
      }),
    );
  });

  it("rejects negatives", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: -1 }), (n) => {
        try {
          validateByteSize(n);
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
        }
      }),
    );
  });
});

describe("SourceFileKind (property)", () => {
  it("round-trips every enumerated kind", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SourceFileKind.values), (kind) => {
        expect(SourceFileKind.create(kind)).toBe(kind);
      }),
    );
  });
});

describe("IngestionLimits.maxBytesFor (property)", () => {
  it("returns override when present, default otherwise", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (defaultCap, overrideCap) => {
          const limits = IngestionLimits.create({
            defaultMaxBytes: defaultCap,
            maxBytesByKind: { image: overrideCap },
            maxRegenerations: 5,
          });
          expect(IngestionLimits.maxBytesFor(limits, "image")).toBe(
            overrideCap,
          );
          expect(IngestionLimits.maxBytesFor(limits, "html")).toBe(defaultCap);
        },
      ),
    );
  });
});
