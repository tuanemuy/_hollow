import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { DirectoryErrorCode } from "../errorCode";
import {
  DirectoryDepth,
  DirectoryId,
  DirectoryName,
  DirectorySlug,
  MAX_DIRECTORY_DEPTH,
} from "../valueObject";

const DIRECTORY_NAME_MAX_LENGTH = 80;
const FORBIDDEN = ["/", "\\", "<", ">", ":", "|", "?", "*", "\0"];

describe("DirectoryName.create (property)", () => {
  it("accepts any name whose trimmed length is in [1, 80] and contains no forbidden chars", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.integer({ min: 1, max: DIRECTORY_NAME_MAX_LENGTH }),
            fc.string({
              minLength: DIRECTORY_NAME_MAX_LENGTH,
              maxLength: DIRECTORY_NAME_MAX_LENGTH,
              unit: "grapheme-ascii",
            }),
          )
          .map(([len, s]) => {
            // Replace anything that would be forbidden or whitespace with a
            // safe alphabetic character so the property focuses on length /
            // trimming behaviour.
            const body = s
              .split("")
              .map((ch) => (FORBIDDEN.includes(ch) || /\s/.test(ch) ? "a" : ch))
              .join("")
              .slice(0, len);
            return body;
          })
          .filter((s) => s.trim().length >= 1 && s.trim().length <= 80),
        (raw) => {
          const name = DirectoryName.create(raw);
          const s = name as unknown as string;
          expect(s.length).toBeGreaterThanOrEqual(1);
          expect(s.length).toBeLessThanOrEqual(DIRECTORY_NAME_MAX_LENGTH);
          expect(s).toBe(s.trim());
        },
      ),
    );
  });

  it("rejects empty / whitespace-only strings with NameEmpty", () => {
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
            DirectoryName.create(raw);
            expect.fail(`expected throw for: ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(DirectoryErrorCode.NameEmpty);
            }
          }
        },
      ),
    );
  });

  it("rejects names whose trimmed length exceeds 80 with NameTooLong", () => {
    fc.assert(
      fc.property(fc.integer({ min: 81, max: 200 }), (len) => {
        const raw = "a".repeat(len);
        try {
          DirectoryName.create(raw);
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(DirectoryErrorCode.NameTooLong);
          }
        }
      }),
    );
  });

  it("rejects names containing any forbidden character with NameForbiddenCharacter", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{1,40}$/),
        fc.constantFrom(...FORBIDDEN),
        fc.stringMatching(/^[a-z]{0,40}$/),
        (left, bad, right) => {
          const raw = `${left}${bad}${right}`;
          try {
            DirectoryName.create(raw);
            expect.fail(`expected throw for raw=${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(
                DirectoryErrorCode.NameForbiddenCharacter,
              );
            }
          }
        },
      ),
    );
  });

  it("equals is reflexive, symmetric, and case-insensitive", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z]{1,40}$/), (raw) => {
        const a = DirectoryName.create(raw);
        const b = DirectoryName.create(raw.toUpperCase());
        const c = DirectoryName.create(raw.toLowerCase());
        expect(DirectoryName.equals(a, a)).toBe(true);
        expect(DirectoryName.equals(a, b)).toBe(DirectoryName.equals(b, a));
        expect(DirectoryName.equals(b, c)).toBe(true);
      }),
    );
  });
});

describe("DirectoryId.create (property)", () => {
  it("accepts any non-empty trimmed string", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => s.trim().length > 0),
        (raw) => {
          const id = DirectoryId.create(raw);
          expect(id as unknown as string).toBe(raw.trim());
        },
      ),
    );
  });

  it("rejects empty / whitespace-only with InvalidId", () => {
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
            DirectoryId.create(raw);
            expect.fail(`expected throw for: ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(DirectoryErrorCode.InvalidId);
            }
          }
        },
      ),
    );
  });
});

describe("DirectoryDepth (property)", () => {
  it("create accepts any integer in [0, MAX]", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_DIRECTORY_DEPTH }), (n) => {
        const d = DirectoryDepth.create(n);
        expect(d as number).toBe(n);
      }),
    );
  });

  it("next bumps by exactly 1 within bounds and throws at the cap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_DIRECTORY_DEPTH }), (n) => {
        const d = DirectoryDepth.create(n);
        if (n < MAX_DIRECTORY_DEPTH) {
          expect(DirectoryDepth.next(d) as number).toBe(n + 1);
        } else {
          try {
            DirectoryDepth.next(d);
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(DirectoryErrorCode.TooDeep);
            }
          }
        }
      }),
    );
  });
});

describe("DirectorySlug.fromName (property)", () => {
  it("always produces a slug accepted by DirectorySlug.create", () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[A-Za-z0-9 \-_]{1,40}$/)
          // Avoid whitespace-only after trimming so DirectoryName.create
          // does not throw on us before we reach fromName.
          .filter((s) => s.trim().length > 0),
        (raw) => {
          const name = DirectoryName.create(raw);
          const slug = DirectorySlug.fromName(name);
          // Re-running create on the produced slug must round-trip.
          const round = DirectorySlug.create(slug as unknown as string);
          expect(round).toBe(slug);
        },
      ),
    );
  });
});
