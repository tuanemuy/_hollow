import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { AdminSettingsErrorCode } from "../errorCode";
import {
  DesignTokens,
  InstanceLimits,
  LLMConfig,
  PromptPurpose,
  PromptTemplate,
  RegistrationPolicy,
  UserId,
} from "../valueObject";

function expectBusinessRule(
  error: unknown,
  code: (typeof AdminSettingsErrorCode)[keyof typeof AdminSettingsErrorCode],
): void {
  expect(isBusinessRuleError(error)).toBe(true);
  if (isBusinessRuleError(error)) {
    expect(error.code).toBe(code);
  }
}

describe("UserId", () => {
  it("trims surrounding whitespace and accepts non-empty strings", () => {
    const id = UserId.create("  user-123  ");
    expect(id as unknown as string).toBe("user-123");
  });

  it("rejects empty strings with InvalidUserId", () => {
    try {
      UserId.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidUserId);
    }
  });

  it("rejects whitespace-only strings with InvalidUserId", () => {
    try {
      UserId.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidUserId);
    }
  });
});

describe("PromptPurpose", () => {
  it("enumerates the five canonical purposes", () => {
    expect([...PromptPurpose.values]).toEqual([
      "structure",
      "title",
      "directory",
      "metadata",
      "ocr_assist",
    ]);
  });

  it("creates a known purpose verbatim", () => {
    expect(PromptPurpose.create("structure")).toBe("structure");
  });

  it("rejects an unknown purpose with InvalidPromptPurpose", () => {
    try {
      PromptPurpose.create("bogus");
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidPromptPurpose);
    }
  });
});

describe("PromptTemplate", () => {
  it("accepts a template whose placeholders match expectedVariables", () => {
    const tpl = PromptTemplate.create({
      text: "Hello {{ name }} — your file {{ file }}",
      expectedVariables: ["name", "file"],
    });
    expect(tpl.text).toContain("{{ name }}");
    expect([...tpl.expectedVariables]).toEqual(["name", "file"]);
  });

  it("dedupes expectedVariables while preserving order", () => {
    const tpl = PromptTemplate.create({
      text: "{{a}} {{b}}",
      expectedVariables: ["a", "b", "a"],
    });
    expect([...tpl.expectedVariables]).toEqual(["a", "b"]);
  });

  it("throws VariableMismatch when the template references an unknown placeholder (prompt_variable_missing)", () => {
    try {
      PromptTemplate.create({
        text: "Hi {{name}} — your token {{token}}",
        expectedVariables: ["name"],
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(
        error,
        AdminSettingsErrorCode.PromptTemplateVariableMismatch,
      );
    }
  });

  it("throws PromptTemplateTooLarge when text byte length exceeds 16 KiB (prompt_too_large)", () => {
    const raw = "a".repeat(16 * 1024 + 1);
    try {
      PromptTemplate.create({ text: raw, expectedVariables: [] });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.PromptTemplateTooLarge);
    }
  });

  it("accepts a template whose text length is exactly 16 KiB", () => {
    const raw = "a".repeat(16 * 1024);
    const tpl = PromptTemplate.create({ text: raw, expectedVariables: [] });
    expect(tpl.text.length).toBe(16 * 1024);
  });

  it("rejects invalid expected variable names", () => {
    try {
      PromptTemplate.create({
        text: "",
        expectedVariables: ["bad-name"],
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(
        error,
        AdminSettingsErrorCode.PromptTemplateInvalidVariableName,
      );
    }
  });

  it("treats expectedVariables that are unused in the text as a no-op (mismatch only flagged in the reverse direction)", () => {
    const tpl = PromptTemplate.create({
      text: "static",
      expectedVariables: ["unused"],
    });
    expect(tpl.text).toBe("static");
  });
});

describe("LLMConfig", () => {
  it("creates an env-sourced config with apiKeyCiphertext = null", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      apiKeySource: "env",
      apiKeyCiphertext: null,
    });
    expect(cfg.apiKeySource).toBe("env");
    expect(cfg.apiKeyCiphertext).toBeNull();
  });

  it("creates a db-sourced config with a non-empty ciphertext", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      apiKeySource: "db",
      apiKeyCiphertext: "ENCRYPTED",
    });
    expect(cfg.apiKeySource).toBe("db");
    expect(cfg.apiKeyCiphertext).toBe("ENCRYPTED");
  });

  it("rejects an unknown provider", () => {
    try {
      LLMConfig.create({
        provider: "openai",
        model: "gpt-4",
        apiKeySource: "env",
        apiKeyCiphertext: null,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidLLMProvider);
    }
  });

  it("rejects an empty model string (ValidationError on unsafe model)", () => {
    try {
      LLMConfig.create({
        provider: "anthropic",
        model: "   ",
        apiKeySource: "env",
        apiKeyCiphertext: null,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidLLMModel);
    }
  });

  it("rejects a model string longer than 120 characters", () => {
    try {
      LLMConfig.create({
        provider: "anthropic",
        model: "a".repeat(121),
        apiKeySource: "env",
        apiKeyCiphertext: null,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidLLMModelTooLong);
    }
  });

  it("rejects an unknown apiKeySource", () => {
    try {
      LLMConfig.create({
        provider: "anthropic",
        model: "m",
        apiKeySource: "vault",
        apiKeyCiphertext: null,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidLLMApiKeySource);
    }
  });

  it("rejects db-sourced config with null ciphertext", () => {
    try {
      LLMConfig.create({
        provider: "anthropic",
        model: "m",
        apiKeySource: "db",
        apiKeyCiphertext: null,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(
        error,
        AdminSettingsErrorCode.InvalidLLMApiKeyCiphertext,
      );
    }
  });

  it("rejects env-sourced config with non-null ciphertext", () => {
    try {
      LLMConfig.create({
        provider: "anthropic",
        model: "m",
        apiKeySource: "env",
        apiKeyCiphertext: "leftover",
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(
        error,
        AdminSettingsErrorCode.InvalidLLMApiKeyCiphertext,
      );
    }
  });
});

describe("DesignTokens", () => {
  it("creates an empty tokens map", () => {
    const tokens = DesignTokens.empty();
    expect(Object.keys(tokens.tokens)).toHaveLength(0);
  });

  it("accepts canonical key / value pairs", () => {
    const tokens = DesignTokens.create({
      tokens: {
        "--color-primary": "#123456",
        "--spacing-1": "0.25rem",
      },
    });
    expect(tokens.tokens["--color-primary"]).toBe("#123456");
    expect(tokens.tokens["--spacing-1"]).toBe("0.25rem");
  });

  it("rejects an uppercase / non-canonical key (--FOO)", () => {
    try {
      DesignTokens.create({ tokens: { "--FOO": "red" } });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidDesignTokenKey);
    }
  });

  it("rejects a key without the leading `--`", () => {
    try {
      DesignTokens.create({ tokens: { "color-primary": "red" } });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidDesignTokenKey);
    }
  });

  it("rejects empty values", () => {
    try {
      DesignTokens.create({ tokens: { "--color-primary": "" } });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidDesignTokenValue);
    }
  });

  it("rejects values containing CSS-breaking characters", () => {
    for (const bad of ["a;b", "a{b", "a}b", "a\nb"]) {
      try {
        DesignTokens.create({ tokens: { "--x": bad } });
        expect.fail(`should have thrown for value: ${JSON.stringify(bad)}`);
      } catch (error) {
        expectBusinessRule(
          error,
          AdminSettingsErrorCode.InvalidDesignTokenValue,
        );
      }
    }
  });

  it("rejects more than 200 entries", () => {
    const tokens: Record<string, string> = {};
    for (let i = 0; i < 201; i++) {
      tokens[`--k-${i}`] = "1";
    }
    try {
      DesignTokens.create({ tokens });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.DesignTokensTooMany);
    }
  });
});

describe("RegistrationPolicy", () => {
  it("preserves closedReason when open=false", () => {
    const policy = RegistrationPolicy.create({
      open: false,
      closedReason: "maintenance",
    });
    expect(policy.open).toBe(false);
    expect(policy.closedReason).toBe("maintenance");
  });

  it("drops closedReason when open=true (a reason is meaningless while open)", () => {
    const policy = RegistrationPolicy.create({
      open: true,
      closedReason: "stale-reason",
    });
    expect(policy.open).toBe(true);
    expect(policy.closedReason).toBeNull();
  });

  it("normalizes whitespace-only closedReason to null", () => {
    const policy = RegistrationPolicy.create({
      open: false,
      closedReason: "   ",
    });
    expect(policy.closedReason).toBeNull();
  });

  it("rejects closedReason exceeding 500 characters", () => {
    try {
      RegistrationPolicy.create({
        open: false,
        closedReason: "x".repeat(501),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(
        error,
        AdminSettingsErrorCode.InvalidRegistrationClosedReason,
      );
    }
  });
});

describe("InstanceLimits", () => {
  const VALID = {
    maxUploadBytesPerDay: 1_073_741_824,
    maxIngestionBytes: 33_554_432,
    maxNoteBytes: 1_048_576,
    maxExportArtifactBytes: 268_435_456,
    maxShareLinksPerNote: 16,
    editLockTtlSec: 300,
    trashRetentionDays: 30,
  };

  it("accepts a valid limits set", () => {
    const limits = InstanceLimits.create(VALID);
    expect(limits.maxUploadBytesPerDay).toBe(VALID.maxUploadBytesPerDay);
  });

  it("rejects a negative value (ValidationError on negative limits)", () => {
    try {
      InstanceLimits.create({ ...VALID, maxNoteBytes: -1 });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidInstanceLimit);
    }
  });

  it("rejects zero (limits must be strictly positive)", () => {
    try {
      InstanceLimits.create({ ...VALID, editLockTtlSec: 0 });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidInstanceLimit);
    }
  });

  it("rejects a non-integer value", () => {
    try {
      InstanceLimits.create({ ...VALID, trashRetentionDays: 1.5 });
      expect.fail("should have thrown");
    } catch (error) {
      expectBusinessRule(error, AdminSettingsErrorCode.InvalidInstanceLimit);
    }
  });
});
