import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import type { TagId } from "@/core/domain/tag/valueObject";
import { ViewErrorCode } from "../errorCode";
import {
  DateRange,
  SavedViewName,
  ViewKeyword,
  ViewQuery,
} from "../valueObject";

const NAME_MAX = 60;
const KEYWORD_MAX = 200;

describe("SavedViewName.create (property)", () => {
  it("accepts any string whose trimmed length is in [1, 60]", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.integer({ min: 1, max: NAME_MAX }),
            fc.string({
              minLength: NAME_MAX,
              maxLength: NAME_MAX,
              unit: "grapheme-ascii",
            }),
          )
          .map(([len, s]) => s.replace(/\s/g, "a").slice(0, len))
          .filter((s) => s.trim().length >= 1 && s.trim().length <= NAME_MAX),
        (raw) => {
          const name = SavedViewName.create(raw);
          const s = name as unknown as string;
          expect(s.length).toBeGreaterThanOrEqual(1);
          expect(s.length).toBeLessThanOrEqual(NAME_MAX);
          expect(s).toBe(s.trim());
        },
      ),
    );
  });

  it("rejects whitespace-only strings with NameEmpty", () => {
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
            SavedViewName.create(raw);
            expect.fail(`expected throw for empty: ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(ViewErrorCode.NameEmpty);
            }
          }
        },
      ),
    );
  });

  it("rejects names whose trimmed length exceeds 60 with NameTooLong", () => {
    fc.assert(
      fc.property(fc.integer({ min: NAME_MAX + 1, max: 500 }), (len) => {
        const raw = "a".repeat(len);
        try {
          SavedViewName.create(raw);
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(ViewErrorCode.NameTooLong);
          }
        }
      }),
    );
  });

  it("equals is case-insensitive and symmetric", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z]{1,30}$/), (body) => {
        const a = SavedViewName.create(body);
        const b = SavedViewName.create(body.toUpperCase());
        expect(SavedViewName.equals(a, b)).toBe(true);
        expect(SavedViewName.equals(b, a)).toBe(true);
      }),
    );
  });
});

describe("ViewKeyword.create (property)", () => {
  it("accepts trimmed length in [1, 200]", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: KEYWORD_MAX }), (len) => {
        const raw = "a".repeat(len);
        const kw = ViewKeyword.create(raw);
        expect((kw as unknown as string).length).toBe(len);
      }),
    );
  });

  it("rejects empty strings", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(" ", "\t", "\n"), {
            minLength: 0,
            maxLength: 5,
          })
          .map((chars) => chars.join("")),
        (raw) => {
          try {
            ViewKeyword.create(raw);
            expect.fail(`expected throw for empty: ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(ViewErrorCode.KeywordEmpty);
            }
          }
        },
      ),
    );
  });

  it("rejects length > 200", () => {
    fc.assert(
      fc.property(fc.integer({ min: KEYWORD_MAX + 1, max: 500 }), (len) => {
        try {
          ViewKeyword.create("a".repeat(len));
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(ViewErrorCode.KeywordTooLong);
          }
        }
      }),
    );
  });
});

describe("DateRange.create (property)", () => {
  it("rejects (null, null) with InvalidDateRange", () => {
    try {
      DateRange.create({ from: null, to: null });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(ViewErrorCode.InvalidDateRange);
      }
    }
  });

  it("accepts any range where from <= to", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (a, b) => {
          const from = new Date(Math.min(a, b));
          const to = new Date(Math.max(a, b));
          const range = DateRange.create({ from, to });
          expect(range.from?.getTime()).toBeLessThanOrEqual(
            range.to?.getTime() ?? Number.POSITIVE_INFINITY,
          );
        },
      ),
    );
  });

  it("rejects ranges where from > to", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (a, b) => {
          fc.pre(a > b);
          try {
            DateRange.create({ from: new Date(a), to: new Date(b) });
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(ViewErrorCode.InvalidDateRange);
            }
          }
        },
      ),
    );
  });
});

describe("ViewQuery (property)", () => {
  it("dedups tagIds preserving first-seen order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^t[0-9]{1,3}$/), {
          minLength: 0,
          maxLength: 10,
        }),
        (raws) => {
          const tagIds = raws.map((r) => r as TagId);
          const query = ViewQuery.create({
            directoryId: null,
            tagIds,
            dateRange: null,
            keyword: null,
            referencingNoteId: null,
            visibilityFilter: [],
          });
          const expected: TagId[] = [];
          const seen = new Set<string>();
          for (const id of tagIds) {
            if (!seen.has(id)) {
              seen.add(id);
              expected.push(id);
            }
          }
          expect([...query.tagIds]).toEqual(expected);
        },
      ),
    );
  });
});
