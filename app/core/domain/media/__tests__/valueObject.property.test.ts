import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { MediaErrorCode } from "../errorCode";
import {
  MediaAssetId,
  MimeType,
  OriginalFileName,
  StorageKey,
  validateByteSize,
  validateDimension,
  validateDurationMs,
  validateRefCount,
} from "../valueObject";

/**
 * Property-based tests for media value objects. Covers normalization
 * (trim is idempotent), the closed validity intervals on the numeric
 * validators, and the symmetric rejection of empty / whitespace-only
 * strings on every branded string factory.
 */

const whitespaceArb = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
    minLength: 0,
    maxLength: 10,
  })
  .map((chars) => chars.join(""));

describe("MediaAssetId.create (property)", () => {
  it("rejects empty / whitespace-only with InvalidId", () => {
    fc.assert(
      fc.property(whitespaceArb, (raw) => {
        try {
          MediaAssetId.create(raw);
          expect.fail(`expected throw for ${JSON.stringify(raw)}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(MediaErrorCode.InvalidId);
          }
        }
      }),
    );
  });

  it("trims surrounding whitespace and accepts any non-empty trimmed string", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => s.trim().length > 0),
        (raw) => {
          const id = MediaAssetId.create(raw);
          expect(id as unknown as string).toBe(raw.trim());
        },
      ),
    );
  });
});

describe("MimeType.create (property)", () => {
  it("accepts well-formed type/subtype and trims whitespace", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{1,20}$/),
        fc.stringMatching(/^[a-z]{1,20}$/),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (typeStr, subtype, left, right) => {
          const padded = `${" ".repeat(left)}${typeStr}/${subtype}${" ".repeat(right)}`;
          const m = MimeType.create(padded);
          expect(m as unknown as string).toBe(`${typeStr}/${subtype}`);
        },
      ),
    );
  });

  it("rejects strings without `/` separator", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,30}$/), (raw) => {
        try {
          MimeType.create(raw);
          expect.fail(`expected throw for ${JSON.stringify(raw)}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(MediaErrorCode.InvalidMimeType);
          }
        }
      }),
    );
  });
});

describe("StorageKey.create (property)", () => {
  it("trims whitespace; output equals trimmed input", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9/_-]{1,100}$/),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (body, left, right) => {
          const padded = `${" ".repeat(left)}${body}${" ".repeat(right)}`;
          expect(StorageKey.create(padded) as unknown as string).toBe(body);
        },
      ),
    );
  });

  it("rejects keys whose trimmed length exceeds 1024", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1025, max: 2000 }), (len) => {
        try {
          StorageKey.create("a".repeat(len));
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(MediaErrorCode.InvalidStorageKey);
          }
        }
      }),
    );
  });
});

describe("OriginalFileName.create (property)", () => {
  it("rejects strings whose trimmed length exceeds 255", () => {
    fc.assert(
      fc.property(fc.integer({ min: 256, max: 500 }), (len) => {
        try {
          OriginalFileName.create("a".repeat(len));
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(MediaErrorCode.InvalidOriginalFileName);
          }
        }
      }),
    );
  });
});

describe("validateByteSize (property)", () => {
  const BYTE_SIZE_MAX = 5 * 1024 * 1024 * 1024 * 1024;

  it("accepts every non-negative integer up to the cap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: BYTE_SIZE_MAX }), (n) => {
        expect(validateByteSize(n)).toBe(n);
      }),
    );
  });

  it("rejects negative integers with InvalidByteSize", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: -1 }), (n) => {
        try {
          validateByteSize(n);
          expect.fail(`expected throw for ${n}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(MediaErrorCode.InvalidByteSize);
          }
        }
      }),
    );
  });
});

describe("validateDimension (property)", () => {
  it("accepts every positive integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (n) => {
        expect(validateDimension(n)).toBe(n);
      }),
    );
  });

  it("rejects zero / negative integers", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 0 }), (n) => {
        try {
          validateDimension(n);
          expect.fail(`expected throw for ${n}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(MediaErrorCode.InvalidDimension);
          }
        }
      }),
    );
  });
});

describe("validateDurationMs (property)", () => {
  it("accepts every non-negative integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (n) => {
        expect(validateDurationMs(n)).toBe(n);
      }),
    );
  });
});

describe("validateRefCount (property)", () => {
  it("accepts every non-negative integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (n) => {
        expect(validateRefCount(n)).toBe(n);
      }),
    );
  });

  it("rejects negative integers", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000, max: -1 }), (n) => {
        try {
          validateRefCount(n);
          expect.fail(`expected throw for ${n}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(MediaErrorCode.InvalidRefCount);
          }
        }
      }),
    );
  });
});
