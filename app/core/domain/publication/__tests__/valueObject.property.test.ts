import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { PublicationErrorCode } from "../errorCode";
import {
  ShareLinkId,
  ShareLinkPassword,
  ShareLinkTokenHash,
  validateFailedAttempts,
} from "../valueObject";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

describe("ShareLinkPassword.create (property)", () => {
  it("accepts any string whose length is in [8, 128]", () => {
    fc.assert(
      fc.property(
        fc.string({
          minLength: PASSWORD_MIN,
          maxLength: PASSWORD_MAX,
          unit: "grapheme-ascii",
        }),
        (raw) => {
          const created = ShareLinkPassword.create(raw);
          expect(created as unknown as string).toBe(raw);
        },
      ),
    );
  });

  it("rejects any string shorter than 8 with ShareLinkPasswordTooShort", () => {
    fc.assert(
      fc.property(
        fc.string({
          minLength: 0,
          maxLength: PASSWORD_MIN - 1,
          unit: "grapheme-ascii",
        }),
        (raw) => {
          try {
            ShareLinkPassword.create(raw);
            expect.fail(`expected throw for len=${raw.length}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(
                PublicationErrorCode.ShareLinkPasswordTooShort,
              );
            }
          }
        },
      ),
    );
  });

  it("rejects any string longer than 128 with ShareLinkPasswordTooLong", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: PASSWORD_MAX + 1, max: PASSWORD_MAX + 200 }),
        (len) => {
          const raw = "a".repeat(len);
          try {
            ShareLinkPassword.create(raw);
            expect.fail(`expected throw for len=${len}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(
                PublicationErrorCode.ShareLinkPasswordTooLong,
              );
            }
          }
        },
      ),
    );
  });
});

describe("ShareLinkId.create (property)", () => {
  it("accepts any non-empty, non-whitespace-only string and trims it", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => s.trim().length > 0),
        (raw) => {
          const id = ShareLinkId.create(raw);
          expect(id as unknown as string).toBe(raw.trim());
        },
      ),
    );
  });

  it("rejects whitespace-only with InvalidShareLinkId", () => {
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
            ShareLinkId.create(raw);
            expect.fail(`expected throw for ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(PublicationErrorCode.InvalidShareLinkId);
            }
          }
        },
      ),
    );
  });
});

describe("ShareLinkTokenHash.create (property)", () => {
  it("trims and accepts any non-empty hash", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => s.trim().length > 0),
        (raw) => {
          const hash = ShareLinkTokenHash.create(raw);
          expect(hash as unknown as string).toBe(raw.trim());
        },
      ),
    );
  });
});

describe("validateFailedAttempts (property)", () => {
  it("accepts any non-negative integer", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (n) => {
        expect(validateFailedAttempts(n)).toBe(n);
      }),
    );
  });

  it("rejects any negative integer with InvalidFailedAttempts", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: -1 }), (n) => {
        try {
          validateFailedAttempts(n);
          expect.fail(`expected throw for ${n}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(PublicationErrorCode.InvalidFailedAttempts);
          }
        }
      }),
    );
  });
});
