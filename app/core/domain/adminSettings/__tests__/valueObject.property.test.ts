import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { AdminSettingsErrorCode } from "../errorCode";
import {
  DesignTokens,
  InstanceLimits,
  PromptTemplate,
  RegistrationPolicy,
} from "../valueObject";

/**
 * Property-based tests for adminSettings value objects.
 *
 * Covers boundary invariants (16 KiB byte cap, variable-name pattern,
 * positive-integer limits, design-token key shape) over broad input
 * distributions.
 */

const PROMPT_TEMPLATE_MAX_BYTES = 16 * 1024;
const DESIGN_TOKEN_KEY_REGEX = /^--[a-z0-9-]+$/;

describe("PromptTemplate.create (property)", () => {
  it("accepts arbitrary plain text within the 16 KiB byte cap when there are no placeholders", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1000 }).filter((s) => {
          const bytes = new TextEncoder().encode(s).length;
          return bytes <= PROMPT_TEMPLATE_MAX_BYTES && !/\{\{/.test(s);
        }),
        (text) => {
          const tpl = PromptTemplate.create({ text, expectedVariables: [] });
          expect(tpl.text).toBe(text);
        },
      ),
    );
  });

  it("rejects any text whose byte length exceeds 16 KiB with PromptTemplateTooLarge", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: PROMPT_TEMPLATE_MAX_BYTES + 1, max: 20 * 1024 }),
        (len) => {
          const text = "a".repeat(len);
          try {
            PromptTemplate.create({ text, expectedVariables: [] });
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(
                AdminSettingsErrorCode.PromptTemplateTooLarge,
              );
            }
          }
        },
      ),
    );
  });

  it("rejects placeholders that are absent from expectedVariables with VariableMismatch", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{1,20}$/),
        fc.stringMatching(/^[a-z]{1,20}$/),
        (used, expected) => {
          if (used === expected) return;
          try {
            PromptTemplate.create({
              text: `prefix {{${used}}} suffix`,
              expectedVariables: [expected],
            });
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(
                AdminSettingsErrorCode.PromptTemplateVariableMismatch,
              );
            }
          }
        },
      ),
    );
  });
});

describe("DesignTokens.create (property)", () => {
  it("accepts any key matching /^--[a-z0-9-]+$/ with a non-empty CSS-safe value", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
        fc.stringMatching(/^[a-zA-Z0-9#.%() -]{1,40}$/),
        (suffix, value) => {
          const key = `--${suffix}`;
          if (!DESIGN_TOKEN_KEY_REGEX.test(key)) return;
          const tokens = DesignTokens.create({ tokens: { [key]: value } });
          expect(tokens.tokens[key]).toBe(value);
        },
      ),
    );
  });

  it("rejects any value containing a CSS-breaking character", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
        fc.constantFrom(";", "{", "}", "\n", "\r"),
        (suffix, forbidden) => {
          const key = `--${suffix}`;
          if (!DESIGN_TOKEN_KEY_REGEX.test(key)) return;
          try {
            DesignTokens.create({ tokens: { [key]: `red${forbidden}blue` } });
            expect.fail("should have thrown");
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(
                AdminSettingsErrorCode.InvalidDesignTokenValue,
              );
            }
          }
        },
      ),
    );
  });
});

describe("InstanceLimits.create (property)", () => {
  it("rejects any non-positive integer for any limit field", () => {
    const fields = [
      "maxUploadBytesPerDay",
      "maxIngestionBytes",
      "maxNoteBytes",
      "maxExportArtifactBytes",
      "maxShareLinksPerNote",
      "editLockTtlSec",
      "trashRetentionDays",
      "maxNoteRevisionsPerNote",
    ] as const;
    const baseValid = {
      maxUploadBytesPerDay: 1_073_741_824,
      maxIngestionBytes: 33_554_432,
      maxNoteBytes: 1_048_576,
      maxExportArtifactBytes: 268_435_456,
      maxShareLinksPerNote: 16,
      editLockTtlSec: 300,
      trashRetentionDays: 30,
      maxNoteRevisionsPerNote: 50,
    };

    fc.assert(
      fc.property(
        fc.constantFrom(...fields),
        fc.integer({ min: -1_000, max: 0 }),
        (field, badValue) => {
          const limits = { ...baseValid, [field]: badValue };
          try {
            InstanceLimits.create(limits);
            expect.fail(`should have thrown for ${field}=${badValue}`);
          } catch (error) {
            expect(isBusinessRuleError(error)).toBe(true);
            if (isBusinessRuleError(error)) {
              expect(error.code).toBe(
                AdminSettingsErrorCode.InvalidInstanceLimit,
              );
            }
          }
        },
      ),
    );
  });
});

describe("RegistrationPolicy.create (property)", () => {
  it("always drops closedReason when open=true regardless of the supplied reason", () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: null }),
        (reason) => {
          const policy = RegistrationPolicy.create({
            open: true,
            closedReason: reason,
          });
          expect(policy.open).toBe(true);
          expect(policy.closedReason).toBeNull();
        },
      ),
    );
  });
});
