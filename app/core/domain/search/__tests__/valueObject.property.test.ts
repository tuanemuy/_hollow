import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { SearchErrorCode } from "../errorCode";
import {
  DateRange,
  IndexJobAttempts,
  SearchCursor,
  SearchKeyword,
  SearchLimit,
  SearchScore,
} from "../valueObject";

/**
 * Property-based tests for Search value objects.
 *
 * Complements the example-based tests in `valueObject.test.ts` by
 * exercising boundary distributions: keyword trimming, limit range,
 * score sign, and attempts monotonicity.
 */

describe("SearchKeyword.create (property)", () => {
  it("accepts any string whose trimmed length is in [1, 200] and returns the trimmed form", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{1,200}$/),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (body, left, right) => {
          const raw = `${" ".repeat(left)}${body}${" ".repeat(right)}`;
          const k = SearchKeyword.create(raw) as unknown as string;
          expect(k).toBe(body);
          expect(k.length).toBeGreaterThanOrEqual(1);
          expect(k.length).toBeLessThanOrEqual(200);
        },
      ),
    );
  });

  it("rejects empty / whitespace-only inputs as KeywordEmpty", () => {
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
            SearchKeyword.create(raw);
            expect.fail(`expected throw for ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(SearchErrorCode.KeywordEmpty);
            }
          }
        },
      ),
    );
  });

  it("rejects keywords whose trimmed length exceeds 200 as KeywordTooLong", () => {
    fc.assert(
      fc.property(fc.integer({ min: 201, max: 600 }), (len) => {
        const raw = "k".repeat(len);
        try {
          SearchKeyword.create(raw);
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(SearchErrorCode.KeywordTooLong);
          }
        }
      }),
    );
  });
});

describe("SearchLimit.create (property)", () => {
  it("accepts every integer in [1, 50]", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        expect(SearchLimit.create(n) as unknown as number).toBe(n);
      }),
    );
  });

  it("rejects every integer outside [1, 50]", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 51, max: 10_000 })),
        (n) => {
          try {
            SearchLimit.create(n);
            expect.fail(`expected throw for ${n}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(SearchErrorCode.LimitOutOfRange);
            }
          }
        },
      ),
    );
  });
});

describe("SearchScore.create (property)", () => {
  it("accepts every finite, non-negative number", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1_000_000, noNaN: true }), (n) => {
        expect(SearchScore.create(n) as unknown as number).toBe(n);
      }),
    );
  });
});

describe("IndexJobAttempts.next (property)", () => {
  it("is strictly monotonic — n calls produce attempts = n", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (n) => {
        let a = IndexJobAttempts.zero();
        for (let i = 0; i < n; i += 1) {
          a = IndexJobAttempts.next(a);
        }
        expect(a as unknown as number).toBe(n);
      }),
    );
  });
});

describe("SearchCursor.create (property)", () => {
  it("accepts every non-empty string of length <= 1024", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1024, unit: "grapheme-ascii" }),
        (raw) => {
          expect(SearchCursor.create(raw) as unknown as string).toBe(raw);
        },
      ),
    );
  });
});

describe("DateRange.create (property)", () => {
  it("accepts every pair where from <= to", () => {
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
          expect(range.from.getTime()).toBe(lo);
          expect(range.to.getTime()).toBe(hi);
        },
      ),
    );
  });

  it("rejects every pair where from > to", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (a, b) => {
          if (a === b) return; // degenerate is valid, skip.
          const hi = Math.max(a, b);
          const lo = Math.min(a, b);
          try {
            DateRange.create({ from: new Date(hi), to: new Date(lo) });
            expect.fail(`expected throw for from=${hi} to=${lo}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(SearchErrorCode.InvalidDateRange);
            }
          }
        },
      ),
    );
  });
});
