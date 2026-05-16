import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { NoteErrorCode } from "../errorCode";
import { ContentHtml, NoteId, NoteSlug, NoteTitle } from "../valueObject";

const NOTE_TITLE_MAX_LENGTH = 200;
const CONTENT_HTML_MAX_BYTES = 1024 * 1024;

describe("NoteTitle.create (property)", () => {
  it("accepts trimmed lengths in [1, 200]", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.integer({ min: 1, max: NOTE_TITLE_MAX_LENGTH }),
            fc.string({
              minLength: NOTE_TITLE_MAX_LENGTH,
              maxLength: NOTE_TITLE_MAX_LENGTH,
              unit: "grapheme-ascii",
            }),
          )
          .map(([len, s]) => s.replace(/\s/g, "a").slice(0, len))
          .filter((s) => s.trim().length >= 1 && s.trim().length <= 200),
        (raw) => {
          const title = NoteTitle.create(raw);
          const s = title as unknown as string;
          expect(s.length).toBeGreaterThanOrEqual(1);
          expect(s.length).toBeLessThanOrEqual(NOTE_TITLE_MAX_LENGTH);
          expect(s).toBe(s.trim());
        },
      ),
    );
  });

  it("rejects pure-whitespace inputs with TitleEmpty", () => {
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
            NoteTitle.create(raw);
            expect.fail(`expected throw for ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(NoteErrorCode.TitleEmpty);
            }
          }
        },
      ),
    );
  });

  it("rejects over-length titles with TitleTooLong", () => {
    fc.assert(
      fc.property(fc.integer({ min: 201, max: 800 }), (len) => {
        try {
          NoteTitle.create("a".repeat(len));
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(NoteErrorCode.TitleTooLong);
          }
        }
      }),
    );
  });
});

describe("NoteSlug.create (property)", () => {
  it("accepts any kebab-shape slug of length [1, 120]", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,119}$/), (raw) => {
        const slug = NoteSlug.create(raw);
        expect(slug as unknown as string).toBe(raw);
      }),
    );
  });

  it("rejects slugs above 120 characters with SlugTooLong", () => {
    fc.assert(
      fc.property(fc.integer({ min: 121, max: 500 }), (len) => {
        const raw = `a${"-".repeat(len - 1)}`;
        try {
          NoteSlug.create(raw);
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(NoteErrorCode.SlugTooLong);
          }
        }
      }),
    );
  });

  it("rejects empty slug with SlugEmpty", () => {
    try {
      NoteSlug.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.SlugEmpty);
      }
    }
  });
});

describe("NoteId.create (property)", () => {
  it("accepts any non-empty trimmed string", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 80 })
          .filter((s) => s.trim().length > 0),
        (raw) => {
          const id = NoteId.create(raw);
          expect(id as unknown as string).toBe(raw.trim());
        },
      ),
    );
  });

  it("rejects whitespace-only inputs with InvalidId", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
            minLength: 0,
            maxLength: 8,
          })
          .map((chars) => chars.join("")),
        (raw) => {
          try {
            NoteId.create(raw);
            expect.fail(`expected throw for ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(NoteErrorCode.InvalidId);
            }
          }
        },
      ),
    );
  });
});

describe("ContentHtml.create (property)", () => {
  it("accepts payloads at or below the byte cap", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: CONTENT_HTML_MAX_BYTES }),
        (len) => {
          const raw = "a".repeat(len);
          const html = ContentHtml.create(raw);
          expect((html as unknown as string).length).toBe(len);
        },
      ),
      { numRuns: 20 },
    );
  });
});
