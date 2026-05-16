import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { IdentityErrorCode } from "../errorCode";
import {
  Bio,
  DisplayName,
  EmailAddress,
  RawPassword,
  Username,
} from "../valueObject";

/**
 * Property-based tests covering boundary conditions for identity value
 * objects. We focus on length / format invariants and the trim semantics
 * shared across all string VOs.
 */

const USERNAME_RESERVED = new Set([
  "admin",
  "api",
  "auth",
  "login",
  "signup",
  "settings",
  "share",
  "static",
  "assets",
]);

describe("Username (property)", () => {
  // Body that satisfies the [a-z0-9][a-z0-9-]*[a-z0-9] pattern, length 3..32.
  const validInner = fc
    .stringMatching(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/)
    .filter((s) => s.length >= 3 && s.length <= 32)
    .filter((s) => !USERNAME_RESERVED.has(s));

  it("accepts every conforming name and returns the same string", () => {
    fc.assert(
      fc.property(validInner, (raw) => {
        const out = Username.create(raw);
        expect(out as unknown as string).toBe(raw);
      }),
    );
  });

  it("rejects any uppercase-containing name", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{2,30}$/), (s) => {
        const withUpper = `A${s}`;
        try {
          Username.create(withUpper);
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
        }
      }),
    );
  });

  it("rejects strings over 32 chars", () => {
    fc.assert(
      fc.property(fc.integer({ min: 33, max: 80 }), (len) => {
        try {
          Username.create("a".repeat(len));
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(IdentityErrorCode.UsernameTooLong);
          }
        }
      }),
    );
  });
});

describe("EmailAddress (property)", () => {
  it("normalises to lowercase", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z]{1,16}$/),
        fc.stringMatching(/^[A-Za-z]{1,16}$/),
        fc.stringMatching(/^[A-Za-z]{1,5}$/),
        (local, domain, tld) => {
          const raw = `${local}@${domain}.${tld}`;
          const email = EmailAddress.create(raw);
          expect(email as unknown as string).toBe(raw.toLowerCase());
        },
      ),
    );
  });

  it("rejects strings without an @", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9.]{1,20}$/), (s) => {
        try {
          EmailAddress.create(s);
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
        }
      }),
    );
  });
});

describe("RawPassword (property)", () => {
  it("accepts any 12..128 char string with two character classes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 12, max: 128 }),
        fc.integer({ min: 1, max: 11 }),
        (len, digits) => {
          // Build a string with `digits` digits followed by `len - digits` letters.
          // Guarantees both classes appear.
          const head = "1".repeat(Math.min(digits, len - 1));
          const tail = "a".repeat(len - head.length);
          const raw = head + tail;
          const out = RawPassword.create(raw);
          expect((out as unknown as string).length).toBe(len);
        },
      ),
    );
  });

  it("rejects every length < 12 with PasswordTooShort", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 11 }), (len) => {
        try {
          RawPassword.create("a".repeat(len));
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(IdentityErrorCode.PasswordTooShort);
          }
        }
      }),
    );
  });

  it("rejects 12..128 char passwords using only one character class", () => {
    fc.assert(
      fc.property(fc.integer({ min: 12, max: 64 }), (len) => {
        try {
          RawPassword.create("a".repeat(len));
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(
              IdentityErrorCode.PasswordInsufficientVariety,
            );
          }
        }
      }),
    );
  });
});

describe("DisplayName (property)", () => {
  it("trims surrounding whitespace and preserves the inner body", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{1,50}$/),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (body, left, right) => {
          const padded = `${" ".repeat(left)}${body}${" ".repeat(right)}`;
          expect(DisplayName.create(padded)).toBe(body);
        },
      ),
    );
  });

  it("rejects any 51..200 char body", () => {
    fc.assert(
      fc.property(fc.integer({ min: 51, max: 200 }), (len) => {
        try {
          DisplayName.create("a".repeat(len));
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(IdentityErrorCode.DisplayNameTooLong);
          }
        }
      }),
    );
  });
});

describe("Bio (property)", () => {
  it("treats every empty / whitespace-only string as null", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(" ", "\t", "\n"), {
            minLength: 0,
            maxLength: 10,
          })
          .map((parts) => parts.join("")),
        (raw) => {
          expect(Bio.create(raw)).toBeNull();
        },
      ),
    );
  });

  it("rejects any 501..1000 char body", () => {
    fc.assert(
      fc.property(fc.integer({ min: 501, max: 1000 }), (len) => {
        try {
          Bio.create("a".repeat(len));
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(IdentityErrorCode.BioTooLong);
          }
        }
      }),
    );
  });
});
