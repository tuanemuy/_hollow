import { describe, expect, it } from "vitest";
import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import {
  LLMConfig,
  PromptPurpose,
  PromptTemplate,
} from "@/core/domain/adminSettings/valueObject";
import { maskApiKey, toInstanceSettingsView } from "../view";

const T0 = new Date(0);

describe("maskApiKey", () => {
  it("returns null when apiKeySource === 'env'", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "env",
      apiKeyCiphertext: null,
    });
    expect(maskApiKey(cfg)).toBeNull();
  });

  it("masks a db-sourced ciphertext as `••••` + last 4 chars", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "db",
      apiKeyCiphertext: "abcdefghIJKL",
    });
    expect(maskApiKey(cfg)).toBe("••••IJKL");
  });

  it("returns `••••<entire ciphertext>` when ciphertext is shorter than 4 chars", () => {
    // `LLMConfig.create` would normally reject `apiKeyCiphertext === ''`, but
    // longer-than-zero short ciphertexts (1-3 chars) are accepted; the mask
    // surfaces them verbatim.
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "db",
      apiKeyCiphertext: "ab",
    });
    expect(maskApiKey(cfg)).toBe("••••ab");
  });
});

describe("toInstanceSettingsView", () => {
  it("masks the apiKey while preserving non-secret fields", () => {
    const base = InstanceSettings.default(T0);
    const dto = toInstanceSettingsView(base);
    // env-sourced default → masked value is null
    expect(dto.llm.apiKeyMasked).toBeNull();
    expect(dto.llm.provider).toBe(base.llm.provider);
    expect(dto.llm.model).toBe(base.llm.model);
  });

  it("does not leak raw ciphertext on db-sourced configs", () => {
    const raw = "TOPSECRETkey9876";
    const base = InstanceSettings.default(T0);
    const llm = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "db",
      apiKeyCiphertext: raw,
    });
    const next = InstanceSettings.updateLLM(base, llm, T0);
    const dto = toInstanceSettingsView(next);
    expect(dto.llm.apiKeyMasked).toBe(`••••${raw.slice(-4)}`);
    expect(JSON.stringify(dto)).not.toContain(raw);
  });

  it("sets envOverrides all-false when env is null", () => {
    const base = InstanceSettings.default(T0);
    const dto = toInstanceSettingsView(base);
    expect(dto.llm.envOverrides).toEqual({
      provider: false,
      model: false,
      apiKey: false,
      baseURL: false,
    });
  });

  it("sets envOverrides all-false when env fields are all null", () => {
    const base = InstanceSettings.default(T0);
    const dto = toInstanceSettingsView(base, {
      apiKey: null,
      provider: null,
      model: null,
      baseURL: null,
    });
    expect(dto.llm.envOverrides).toEqual({
      provider: false,
      model: false,
      apiKey: false,
      baseURL: false,
    });
  });

  it("flips envOverrides.apiKey when env.apiKey is set, masking returns null", () => {
    const base = InstanceSettings.default(T0);
    const llm = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "db",
      apiKeyCiphertext: "ENCRYPTEDABCD",
    });
    const next = InstanceSettings.updateLLM(base, llm, T0);
    const dto = toInstanceSettingsView(next, {
      apiKey: "sk-env",
      provider: null,
      model: null,
      baseURL: null,
    });
    expect(dto.llm.envOverrides.apiKey).toBe(true);
    expect(dto.llm.envOverrides.provider).toBe(false);
    expect(dto.llm.envOverrides.model).toBe(false);
    expect(dto.llm.envOverrides.baseURL).toBe(false);
    // env override → mask collapses to null so the UI doesn't claim a
    // stored ciphertext is in effect when the env value actually wins.
    expect(dto.llm.apiKeyMasked).toBeNull();
  });

  it("overlays env-supplied provider/model/baseURL onto the DTO", () => {
    const base = InstanceSettings.default(T0);
    // Seed the persisted aggregate with a DB-sourced openai config so the
    // baseURL invariant is satisfied and we can verify the overlay flips
    // the value to the env-supplied one.
    const llm = LLMConfig.create({
      provider: "openai",
      model: "gpt-4o-mini",
      baseURL: "https://api.openai.com/v1",
      apiKeySource: "db",
      apiKeyCiphertext: "ciphertext",
    });
    const next = InstanceSettings.updateLLM(base, llm, T0);
    const dto = toInstanceSettingsView(next, {
      apiKey: null,
      provider: "openai",
      model: "gpt-4o",
      baseURL: "https://api.groq.com/openai/v1",
    });
    expect(dto.llm.envOverrides).toEqual({
      provider: true,
      model: true,
      apiKey: false,
      baseURL: true,
    });
    expect(dto.llm.provider).toBe("openai");
    expect(dto.llm.model).toBe("gpt-4o");
    expect(dto.llm.baseURL).toBe("https://api.groq.com/openai/v1");
  });

  it("env.provider single-set: only provider is overlaid, model/baseURL retain DB values (W-T-001)", () => {
    const base = InstanceSettings.default(T0);
    const llm = LLMConfig.create({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      baseURL: null,
      apiKeySource: "db",
      apiKeyCiphertext: "ciphertext",
    });
    const next = InstanceSettings.updateLLM(base, llm, T0);
    const dto = toInstanceSettingsView(next, {
      apiKey: null,
      provider: "openai",
      model: null,
      baseURL: null,
    });
    expect(dto.llm.envOverrides).toEqual({
      provider: true,
      model: false,
      apiKey: false,
      baseURL: false,
    });
    expect(dto.llm.provider).toBe("openai");
    expect(dto.llm.model).toBe("claude-sonnet-4-6");
    expect(dto.llm.baseURL).toBeNull();
  });

  it("env.model single-set: only model is overlaid, provider/baseURL retain DB values (W-T-001)", () => {
    const base = InstanceSettings.default(T0);
    const llm = LLMConfig.create({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      baseURL: null,
      apiKeySource: "db",
      apiKeyCiphertext: "ciphertext",
    });
    const next = InstanceSettings.updateLLM(base, llm, T0);
    const dto = toInstanceSettingsView(next, {
      apiKey: null,
      provider: null,
      model: "claude-3-opus",
      baseURL: null,
    });
    expect(dto.llm.envOverrides).toEqual({
      provider: false,
      model: true,
      apiKey: false,
      baseURL: false,
    });
    expect(dto.llm.provider).toBe("anthropic");
    expect(dto.llm.model).toBe("claude-3-opus");
    expect(dto.llm.baseURL).toBeNull();
  });

  it("env.baseURL single-set: only baseURL is overlaid, provider/model retain DB values (W-T-001)", () => {
    const base = InstanceSettings.default(T0);
    const llm = LLMConfig.create({
      provider: "openai",
      model: "gpt-4o",
      baseURL: "https://api.openai.com/v1",
      apiKeySource: "db",
      apiKeyCiphertext: "ciphertext",
    });
    const next = InstanceSettings.updateLLM(base, llm, T0);
    const dto = toInstanceSettingsView(next, {
      apiKey: null,
      provider: null,
      model: null,
      baseURL: "https://api.groq.com/openai/v1",
    });
    expect(dto.llm.envOverrides).toEqual({
      provider: false,
      model: false,
      apiKey: false,
      baseURL: true,
    });
    expect(dto.llm.provider).toBe("openai");
    expect(dto.llm.model).toBe("gpt-4o");
    expect(dto.llm.baseURL).toBe("https://api.groq.com/openai/v1");
  });

  it("env.apiKey null + DB ciphertext exists: apiKeyMasked is `••••XXXX`, ciphertext never leaks (W-T-002)", () => {
    const base = InstanceSettings.default(T0);
    const ciphertext = "ENCRYPTEDxyzAB123456";
    const llm = LLMConfig.create({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKeySource: "db",
      apiKeyCiphertext: ciphertext,
    });
    const next = InstanceSettings.updateLLM(base, llm, T0);
    const dto = toInstanceSettingsView(next, {
      apiKey: null,
      provider: null,
      model: null,
      baseURL: null,
    });
    // Mask shape: `••••` + last 4 chars (3456 here).
    expect(dto.llm.apiKeyMasked).toMatch(/^••••.{4}$/);
    expect(dto.llm.apiKeyMasked).toBe(`••••${ciphertext.slice(-4)}`);
    expect(JSON.stringify(dto)).not.toContain(ciphertext);
  });

  it("prompts: every purpose surfaces isOverridden=false when no overrides exist (Issue #218)", () => {
    const base = InstanceSettings.default(T0);
    const dto = toInstanceSettingsView(base);
    for (const purpose of PromptPurpose.values) {
      expect(dto.prompts[purpose]?.isOverridden).toBe(false);
    }
    expect(Object.keys(dto.prompts).sort()).toEqual(
      [...PromptPurpose.values].sort(),
    );
  });

  it("prompts: an installed override surfaces isOverridden=true (Issue #218)", () => {
    const base = InstanceSettings.default(T0);
    const tpl = PromptTemplate.create({
      text: "custom title",
      expectedVariables: [],
    });
    const next = InstanceSettings.updatePrompt(base, "title", tpl, T0);
    const dto = toInstanceSettingsView(next);
    expect(dto.prompts.title?.isOverridden).toBe(true);
    expect(dto.prompts.title?.text).toBe("custom title");
    // Untouched purposes remain on built-in defaults.
    expect(dto.prompts.structure?.isOverridden).toBe(false);
  });

  it("promptDefaults: mirrors BUILTIN_PROMPT_DEFAULTS for every purpose (Issue #218)", () => {
    const base = InstanceSettings.default(T0);
    const dto = toInstanceSettingsView(base);
    expect(Object.keys(dto.promptDefaults).sort()).toEqual(
      [...PromptPurpose.values].sort(),
    );
    for (const purpose of PromptPurpose.values) {
      expect(dto.promptDefaults[purpose]?.text).toBe("");
      expect(dto.promptDefaults[purpose]?.expectedVariables).toEqual([]);
    }
  });

  it("flips all four envOverrides when every ADMIN_LLM_* env is set", () => {
    // Use an openai-shaped persisted config so the baseURL invariant on
    // `LLMConfig.create` is satisfied when the env baseURL is overlaid.
    const base = InstanceSettings.default(T0);
    const llm = LLMConfig.create({
      provider: "openai",
      model: "gpt-4o",
      baseURL: null,
      apiKeySource: "db",
      apiKeyCiphertext: "ENCRYPTED",
    });
    const next = InstanceSettings.updateLLM(base, llm, T0);
    const dto = toInstanceSettingsView(next, {
      apiKey: "sk-env",
      provider: "openai",
      model: "gpt-4o-mini",
      baseURL: "https://api.openai.com/v1",
    });
    expect(dto.llm.envOverrides).toEqual({
      provider: true,
      model: true,
      apiKey: true,
      baseURL: true,
    });
    // env override → apiKeyMasked collapses to null even though the
    // persisted config carries a ciphertext.
    expect(dto.llm.apiKeyMasked).toBeNull();
  });
});
