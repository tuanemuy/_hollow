import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { TagErrorCode } from "../errorCode";
import { TagId, TagName } from "../valueObject";

const TAG_NAME_MAX_LENGTH = 50;

describe("TagName.create (property)", () => {
  // Body characters allowed inside a tag name: printable ASCII without
  // whitespace, control chars, or the leading-hash marker.
  const bodyChar = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_".split(
      "",
    ),
  );
  const bodyArb = fc
    .array(bodyChar, { minLength: 1, maxLength: TAG_NAME_MAX_LENGTH })
    .map((cs) => cs.join(""));

  it("accepts any 1..50-length body of allowed characters", () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        const name = TagName.create(body);
        const s = name as unknown as string;
        expect(s.length).toBeGreaterThanOrEqual(1);
        expect(s.length).toBeLessThanOrEqual(TAG_NAME_MAX_LENGTH);
        expect(s).toBe(body);
      }),
    );
  });

  it("strips exactly one leading `#` before length check", () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        const name = TagName.create(`#${body}`);
        expect(name as unknown as string).toBe(body);
      }),
    );
  });

  it("rejects strings whose post-strip length exceeds 50 with NameTooLong", () => {
    fc.assert(
      fc.property(fc.integer({ min: 51, max: 200 }), (len) => {
        const raw = "a".repeat(len);
        try {
          TagName.create(raw);
          expect.fail(`expected throw for len=${len}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(TagErrorCode.NameTooLong);
          }
        }
      }),
    );
  });

  it("rejects strings containing whitespace with NameInvalidChars", () => {
    const wsArb = fc.constantFrom(" ", "\t", "\n", "\r");
    fc.assert(
      fc.property(bodyArb, bodyArb, wsArb, (a, b, ws) => {
        const raw = `${a}${ws}${b}`;
        try {
          TagName.create(raw);
          expect.fail(`expected throw for ${JSON.stringify(raw)}`);
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(TagErrorCode.NameInvalidChars);
          }
        }
      }),
    );
  });

  it("`equals` is reflexive and identity-respecting under canonicalisation", () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        const a = TagName.create(body);
        const b = TagName.create(`#${body}`);
        expect(TagName.equals(a, a)).toBe(true);
        expect(TagName.equals(a, b)).toBe(true);
      }),
    );
  });
});

describe("TagId.create (property)", () => {
  it("accepts any non-empty, non-whitespace-only string and trims surrounding whitespace", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((s) => s.trim().length > 0),
        (raw) => {
          const id = TagId.create(raw);
          expect(id as unknown as string).toBe(raw.trim());
        },
      ),
    );
  });

  it("rejects empty / whitespace-only strings with InvalidId", () => {
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
            TagId.create(raw);
            expect.fail(`expected throw for empty id: ${JSON.stringify(raw)}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(TagErrorCode.InvalidId);
            }
          }
        },
      ),
    );
  });
});
