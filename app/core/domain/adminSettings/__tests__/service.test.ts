import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import type { SecretBox } from "../ports/secretBox";
import { AdminSettingsService } from "../service";
import { LLMConfig, SpeechRecognitionConfig } from "../valueObject";

class FakeSecretBox implements SecretBox {
  async encrypt(plain: string): Promise<string> {
    return `enc(${plain})`;
  }
  async decrypt(cipher: string): Promise<string> {
    const m = /^enc\((.*)\)$/.exec(cipher);
    if (m === null) {
      throw new Error(`cannot decrypt: ${cipher}`);
    }
    return m[1] as string;
  }
}

describe("AdminSettingsService.decryptApiKey", () => {
  it("returns null when apiKeySource === 'env'", async () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "env",
      apiKeyCiphertext: null,
    });
    expect(
      await AdminSettingsService.decryptApiKey(cfg, new FakeSecretBox()),
    ).toBeNull();
  });

  it("delegates to SecretBox.decrypt when apiKeySource === 'db'", async () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "db",
      apiKeyCiphertext: "enc(sk-test-1)",
    });
    const plain = await AdminSettingsService.decryptApiKey(
      cfg,
      new FakeSecretBox(),
    );
    expect(plain).toBe("sk-test-1");
  });
});

describe("AdminSettingsService.encryptApiKey", () => {
  it("round-trips a plain api key through SecretBox", async () => {
    const box = new FakeSecretBox();
    const cipher = await AdminSettingsService.encryptApiKey("sk-abc", box);
    expect(cipher).toBe("enc(sk-abc)");
    expect(await box.decrypt(cipher)).toBe("sk-abc");
  });
});

describe("AdminSettingsService.assertEnvOverride", () => {
  it("forces apiKeySource = 'env' and drops ciphertext when env.apiKey is set", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "db",
      apiKeyCiphertext: "ENCRYPTED",
    });
    const next = AdminSettingsService.assertEnvOverride(cfg, {
      apiKey: "sk-env",
    });
    expect(next.apiKeySource).toBe("env");
    expect(next.apiKeyCiphertext).toBeNull();
  });

  it("returns the config unchanged when env.apiKey is missing and source is 'db'", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "db",
      apiKeyCiphertext: "ENCRYPTED",
    });
    const next = AdminSettingsService.assertEnvOverride(cfg, { apiKey: null });
    expect(next).toBe(cfg);
  });

  it("treats whitespace-only env.apiKey as present and forces env override", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "db",
      apiKeyCiphertext: "ENCRYPTED",
    });
    const next = AdminSettingsService.assertEnvOverride(cfg, {
      apiKey: "   ",
    });
    expect(next.apiKeySource).toBe("env");
    expect(next.apiKeyCiphertext).toBeNull();
  });

  it("throws EnvOverrideMissingKey when source is 'env' but env.apiKey is missing", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "env",
      apiKeyCiphertext: null,
    });
    try {
      AdminSettingsService.assertEnvOverride(cfg, { apiKey: null });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("admin_settings_env_override_missing_key");
      }
    }
  });

  it("does not throw when source is 'env' and env.apiKey is whitespace-only", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "env",
      apiKeyCiphertext: null,
    });
    const next = AdminSettingsService.assertEnvOverride(cfg, {
      apiKey: "   ",
    });
    expect(next).toBe(cfg);
  });

  it("returns the config verbatim when source is already 'env' and env.apiKey is present", () => {
    const cfg = LLMConfig.create({
      provider: "anthropic",
      model: "m",
      apiKeySource: "env",
      apiKeyCiphertext: null,
    });
    const next = AdminSettingsService.assertEnvOverride(cfg, {
      apiKey: "sk-env",
    });
    expect(next).toBe(cfg);
  });

  it("carries over baseURL when forcing env override on an openai db-sourced config", () => {
    const cfg = LLMConfig.create({
      provider: "openai",
      model: "gpt-4o",
      baseURL: "https://api.groq.com/openai/v1",
      apiKeySource: "db",
      apiKeyCiphertext: "ENCRYPTED",
    });
    const next = AdminSettingsService.assertEnvOverride(cfg, {
      apiKey: "sk-env",
    });
    expect(next.apiKeySource).toBe("env");
    expect(next.apiKeyCiphertext).toBeNull();
    expect(next.baseURL).toBe("https://api.groq.com/openai/v1");
  });
});

const speechCfg = (
  apiKeySource: "env" | "db",
  apiKeyCiphertext: string | null,
): SpeechRecognitionConfig =>
  SpeechRecognitionConfig.create({
    provider: "openai",
    model: "gpt-4o-transcribe",
    apiKeySource,
    apiKeyCiphertext,
  });

describe("AdminSettingsService.decryptSpeechApiKey", () => {
  it("returns null when apiKeySource === 'env'", async () => {
    const cfg = speechCfg("env", null);
    expect(
      await AdminSettingsService.decryptSpeechApiKey(cfg, new FakeSecretBox()),
    ).toBeNull();
  });

  it("delegates to SecretBox.decrypt when apiKeySource === 'db'", async () => {
    const cfg = speechCfg("db", "enc(sk-speech-1)");
    const plain = await AdminSettingsService.decryptSpeechApiKey(
      cfg,
      new FakeSecretBox(),
    );
    expect(plain).toBe("sk-speech-1");
  });
});

describe("AdminSettingsService.assertSpeechEnvOverride", () => {
  it("forces apiKeySource = 'env' and drops ciphertext when env.apiKey is set", () => {
    const cfg = speechCfg("db", "ENCRYPTED");
    const next = AdminSettingsService.assertSpeechEnvOverride(cfg, {
      apiKey: "sk-env",
    });
    expect(next.apiKeySource).toBe("env");
    expect(next.apiKeyCiphertext).toBeNull();
    // provider / model are carried over verbatim.
    expect(next.provider).toBe("openai");
    expect(next.model).toBe("gpt-4o-transcribe");
  });

  it("returns the config unchanged when env.apiKey is missing and source is 'db'", () => {
    const cfg = speechCfg("db", "ENCRYPTED");
    const next = AdminSettingsService.assertSpeechEnvOverride(cfg, {
      apiKey: null,
    });
    expect(next).toBe(cfg);
  });

  it("throws SpeechEnvOverrideMissingKey when source is 'env' but env.apiKey is missing", () => {
    const cfg = speechCfg("env", null);
    try {
      AdminSettingsService.assertSpeechEnvOverride(cfg, { apiKey: null });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(
          "admin_settings_speech_env_override_missing_key",
        );
      }
    }
  });

  it("throws SpeechEnvOverrideMissingKey when source is 'env' and env.apiKey is empty string", () => {
    const cfg = speechCfg("env", null);
    try {
      AdminSettingsService.assertSpeechEnvOverride(cfg, { apiKey: "" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(
          "admin_settings_speech_env_override_missing_key",
        );
      }
    }
  });

  it("returns the config verbatim when source is already 'env' and env.apiKey is present", () => {
    const cfg = speechCfg("env", null);
    const next = AdminSettingsService.assertSpeechEnvOverride(cfg, {
      apiKey: "sk-env",
    });
    expect(next).toBe(cfg);
  });
});
