import { describe, expect, it } from "vitest";
import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { LLMConfig } from "@/core/domain/adminSettings/valueObject";
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
