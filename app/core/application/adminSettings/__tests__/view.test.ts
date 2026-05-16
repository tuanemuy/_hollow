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
});
