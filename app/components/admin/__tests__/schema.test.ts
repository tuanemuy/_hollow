import { describe, expect, it } from "vitest";
import {
  LLM_PROVIDERS_TRANSPORT,
  testLLMConnectionSchema,
  updateLLMConfigSchema,
} from "../schema";

describe("LLM_PROVIDERS_TRANSPORT", () => {
  it("enumerates the three transport-known providers (kept in sync with the VO list)", () => {
    expect([...LLM_PROVIDERS_TRANSPORT]).toEqual([
      "anthropic",
      "openai",
      "gemini",
    ]);
  });
});

describe("updateLLMConfigSchema.baseURL", () => {
  it("collapses whitespace-only input to null", () => {
    const parsed = updateLLMConfigSchema.parse({
      provider: "openai",
      model: "gpt-4o",
      baseURL: "   ",
      apiKeyPlain: "sk-test",
    });
    expect(parsed.baseURL).toBeNull();
  });

  it("collapses empty string to null", () => {
    const parsed = updateLLMConfigSchema.parse({
      provider: "openai",
      model: "gpt-4o",
      baseURL: "",
      apiKeyPlain: "sk-test",
    });
    expect(parsed.baseURL).toBeNull();
  });

  it("preserves a trimmed non-empty baseURL", () => {
    const parsed = updateLLMConfigSchema.parse({
      provider: "openai",
      model: "gpt-4o",
      baseURL: "  https://api.groq.com/openai/v1  ",
      apiKeyPlain: "sk-test",
    });
    expect(parsed.baseURL).toBe("https://api.groq.com/openai/v1");
  });

  it("accepts explicit null", () => {
    const parsed = updateLLMConfigSchema.parse({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      baseURL: null,
      apiKeyPlain: "sk-ant-test",
    });
    expect(parsed.baseURL).toBeNull();
  });

  it("rejects a 501-character baseURL (cap is 500)", () => {
    const long = `https://${"a".repeat(493)}`; // 8 + 493 === 501
    expect(long.length).toBe(501);
    const result = updateLLMConfigSchema.safeParse({
      provider: "openai",
      model: "gpt-4o",
      baseURL: long,
      apiKeyPlain: "sk-test",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a 500-character baseURL (cap boundary)", () => {
    const max = `https://${"a".repeat(492)}`; // 8 + 492 === 500
    expect(max.length).toBe(500);
    const result = updateLLMConfigSchema.safeParse({
      provider: "openai",
      model: "gpt-4o",
      baseURL: max,
      apiKeyPlain: "sk-test",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateLLMConfigSchema.provider", () => {
  it("rejects an unknown provider literal", () => {
    const result = updateLLMConfigSchema.safeParse({
      provider: "azure-openai",
      model: "gpt-4o",
      baseURL: null,
      apiKeyPlain: "sk-test",
    });
    expect(result.success).toBe(false);
  });
});

describe("testLLMConnectionSchema.draftConfig", () => {
  it("accepts an openai draft with a baseURL", () => {
    const parsed = testLLMConnectionSchema.parse({
      useDraft: true,
      draftConfig: {
        provider: "openai",
        model: "gpt-4o",
        baseURL: "https://api.groq.com/openai/v1",
        apiKeySource: "env",
        apiKeyCiphertext: null,
      },
    });
    expect(parsed.draftConfig?.baseURL).toBe("https://api.groq.com/openai/v1");
  });

  it("accepts non-openai providers when baseURL is null", () => {
    for (const provider of ["anthropic", "gemini"] as const) {
      const parsed = testLLMConnectionSchema.parse({
        useDraft: true,
        draftConfig: {
          provider,
          model: "m",
          baseURL: null,
          apiKeySource: "env",
          apiKeyCiphertext: null,
        },
      });
      expect(parsed.draftConfig?.baseURL).toBeNull();
    }
  });

  it("rejects non-openai providers with a non-null baseURL (W-U-001 refine)", () => {
    const result = testLLMConnectionSchema.safeParse({
      useDraft: true,
      draftConfig: {
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: "https://api.anthropic.com",
        apiKeySource: "env",
        apiKeyCiphertext: null,
      },
    });
    expect(result.success).toBe(false);
  });

  it("treats whitespace-only baseURL on non-openai as null (passes the refine)", () => {
    const parsed = testLLMConnectionSchema.parse({
      useDraft: true,
      draftConfig: {
        provider: "gemini",
        model: "gemini-1.5-pro",
        baseURL: "   ",
        apiKeySource: "env",
        apiKeyCiphertext: null,
      },
    });
    expect(parsed.draftConfig?.baseURL).toBeNull();
  });

  it("rejects apiKeySource = 'db' on the draft path (W-F-001 env-only narrowing)", () => {
    const result = testLLMConnectionSchema.safeParse({
      useDraft: true,
      draftConfig: {
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeySource: "db",
        apiKeyCiphertext: null,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-null apiKeyCiphertext on the draft path", () => {
    const result = testLLMConnectionSchema.safeParse({
      useDraft: true,
      draftConfig: {
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeySource: "env",
        apiKeyCiphertext: "ENCRYPTED",
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a null draftConfig (preview no-op)", () => {
    const parsed = testLLMConnectionSchema.parse({
      useDraft: false,
      draftConfig: null,
    });
    expect(parsed.draftConfig).toBeNull();
  });
});
