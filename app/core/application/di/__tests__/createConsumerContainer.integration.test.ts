import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { AnthropicLLMProvider } from "@/core/adapters/anthropic/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/anthropic/pdfExtractor";
import { OpenAILLMProvider } from "@/core/adapters/openai/llmProvider";
import { OpenAISpeechRecognitionProvider } from "@/core/adapters/openai/speechRecognitionProvider";
import { WebCryptoSecretBox } from "@/core/adapters/security/secretBox";
import { StubLLMProvider } from "@/core/adapters/stub/llmProvider";
import { StubOCRProvider } from "@/core/adapters/stub/ocrProvider";
import { StubPDFExtractor } from "@/core/adapters/stub/pdfExtractor";
import { StubSpeechRecognitionProvider } from "@/core/adapters/stub/speechRecognitionProvider";
import {
  createConsumerContainer,
  resolveConsumerLlmConfig,
  resolveConsumerSpeechConfig,
  type ServerEnv,
} from "@/core/application/di/serverCloudflare";

// Stable test-only AES-256 key (base64 of 32 zero bytes). Matches the
// shared test-harness key used elsewhere in the codebase.
const TEST_SECRET_BOX_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/**
 * Integration coverage for ADR-007: env override > DB resolution > Stub
 * fallback in `createConsumerContainer`. Runs against a real Miniflare D1
 * binding so the `instance_settings` read + `secretBox.decrypt` chain is
 * exercised end-to-end, not against fakes.
 *
 * The unit test file (`serverCloudflare.test.ts`) covers the env-only
 * branches with a stub D1 binding (which causes the read to fail and the
 * resolver to fall back to env-only). These cases instead exercise the
 * DB-resolution branches that need real persistence.
 */
async function truncateInstanceSettings(): Promise<void> {
  await env.DB.prepare("DELETE FROM instance_settings").run();
}

async function seedInstanceSettings(opts: {
  provider: string;
  model: string;
  baseURL?: string | null;
  apiKeySource: "env" | "db";
  apiKeyCiphertext?: string | null;
  // Speech columns (Issue #701). Omitted → the NOT-NULL-with-default columns
  // materialize `speech_provider='openai'`, `speech_api_key_source='env'`,
  // and NULL model/ciphertext, so the speech resolver yields `null` (Stub).
  speechProvider?: string;
  speechModel?: string | null;
  speechApiKeySource?: "env" | "db";
  speechApiKeyCiphertext?: string | null;
}): Promise<void> {
  // Seed the singleton row directly via prepared statements rather than
  // through the repository — the repository is part of the UoW pipeline
  // and this test exercises the read-only consumer-resolution path.
  const now = new Date("2026-01-01T00:00:00.000Z").toISOString();
  await env.DB.prepare(
    `INSERT INTO instance_settings (
       id, llm_provider, llm_model, llm_base_url,
       llm_api_key_source, llm_api_key_ciphertext,
       speech_provider, speech_model,
       speech_api_key_source, speech_api_key_ciphertext,
       prompts_json, design_tokens_json,
       registration_open, registration_closed_reason,
       limits_json, version, updated_at
     )
     VALUES ('singleton', ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{"tokens":{}}', 1, NULL, ?, 0, ?)`,
  )
    .bind(
      opts.provider,
      opts.model,
      opts.baseURL ?? null,
      opts.apiKeySource,
      opts.apiKeyCiphertext ?? null,
      opts.speechProvider ?? "openai",
      opts.speechModel ?? null,
      opts.speechApiKeySource ?? "env",
      opts.speechApiKeyCiphertext ?? null,
      JSON.stringify({
        maxUploadBytesPerDay: 0,
        maxIngestionBytes: 0,
        maxNoteBytes: 0,
        maxExportArtifactBytes: 0,
        maxShareLinksPerNote: 0,
        editLockTtlSec: 0,
        trashRetentionDays: 0,
      }),
      now,
    )
    .run();
}

function baseEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    DB: env.DB,
    APP_URL: "http://localhost:8787",
    ...overrides,
  };
}

beforeEach(async () => {
  await truncateInstanceSettings();
});

describe("createConsumerContainer — ADR-007 env override > DB > Stub", () => {
  it("env override path: ADMIN_LLM_API_KEY + ADMIN_LLM_MODEL set → wires the real adapter ignoring DB ciphertext", async () => {
    // Seed DB with a (would-be-decryptable-but-irrelevant) ciphertext and
    // a *different* provider. The env override must completely shadow it.
    await seedInstanceSettings({
      provider: "openai",
      model: "stored-model",
      apiKeySource: "db",
      apiKeyCiphertext: "ignored-because-env-wins",
    });

    const container = await createConsumerContainer(
      baseEnv({
        ADMIN_LLM_API_KEY: "sk-ant-env",
        ADMIN_LLM_MODEL: "claude-3-5-sonnet-latest",
        ADMIN_LLM_PROVIDER: "anthropic",
      }),
    );

    expect(container.llmProvider).toBeInstanceOf(AnthropicLLMProvider);
    expect(container.ocrProvider).toBeInstanceOf(AnthropicOCRProvider);
    expect(container.pdfExtractor).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("DB resolution path: env apiKey absent, DB ciphertext + WebCryptoSecretBox → decrypts and wires the real adapter", async () => {
    // Generate a real ciphertext via the same SecretBox the container will
    // use. This proves the round-trip path (encrypt → DB row → resolver
    // decrypt) actually works end-to-end.
    const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
    const ciphertext = await secretBox.encrypt("sk-openai-from-db");

    await seedInstanceSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      baseURL: "https://api.openai.com/v1",
      apiKeySource: "db",
      apiKeyCiphertext: ciphertext,
    });

    const container = await createConsumerContainer(
      baseEnv({
        // No ADMIN_LLM_API_KEY → DB resolution path
        SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
      }),
    );

    expect(container.llmProvider).toBeInstanceOf(OpenAILLMProvider);
  });

  it("env baseURL override beats DB baseURL when both present", async () => {
    const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
    const ciphertext = await secretBox.encrypt("sk-openai-from-db");

    await seedInstanceSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      baseURL: "https://stored.example.com/v1",
      apiKeySource: "db",
      apiKeyCiphertext: ciphertext,
    });

    const container = await createConsumerContainer(
      baseEnv({
        SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
        ADMIN_LLM_BASE_URL: "https://overridden.example.com/v1",
      }),
    );

    // The provider instance itself is what we care about — the URL is
    // private state. The wiring decision is what's being verified here;
    // adapter-level URL composition has its own unit coverage.
    expect(container.llmProvider).toBeInstanceOf(OpenAILLMProvider);
  });

  // W-I-005: `instanceof OpenAILLMProvider` cannot assert which baseURL the
  // adapter ended up with (the URL is private adapter state). Calling
  // `resolveConsumerLlmConfig` directly exposes `resolved.baseURL`, so the
  // ADR-007 env-override > DB priority for baseURL is verified at the seam
  // where the decision is actually made.
  describe("resolveConsumerLlmConfig — baseURL env override priority (W-I-005)", () => {
    it("env ADMIN_LLM_BASE_URL (non-empty) wins over the DB baseURL", async () => {
      const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
      const ciphertext = await secretBox.encrypt("sk-openai-from-db");

      await seedInstanceSettings({
        provider: "openai",
        model: "gpt-4o-mini",
        baseURL: "https://stored.example.com/v1",
        apiKeySource: "db",
        apiKeyCiphertext: ciphertext,
      });

      const resolved = await resolveConsumerLlmConfig(
        baseEnv({
          SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
          ADMIN_LLM_BASE_URL: "https://overridden.example.com/v1",
        }),
        secretBox,
        null,
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.provider).toBe("openai");
      expect(resolved?.baseURL).toBe("https://overridden.example.com/v1");
      expect(resolved?.apiKey).toBe("sk-openai-from-db");
    });

    it("falls back to the DB baseURL when ADMIN_LLM_BASE_URL is unset", async () => {
      const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
      const ciphertext = await secretBox.encrypt("sk-openai-from-db");

      await seedInstanceSettings({
        provider: "openai",
        model: "gpt-4o-mini",
        baseURL: "https://stored.example.com/v1",
        apiKeySource: "db",
        apiKeyCiphertext: ciphertext,
      });

      const resolved = await resolveConsumerLlmConfig(
        baseEnv({
          SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
          // No ADMIN_LLM_BASE_URL → DB value is used.
        }),
        secretBox,
        null,
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.provider).toBe("openai");
      expect(resolved?.baseURL).toBe("https://stored.example.com/v1");
    });

    it("falls back to the DB baseURL when ADMIN_LLM_BASE_URL is empty", async () => {
      const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
      const ciphertext = await secretBox.encrypt("sk-openai-from-db");

      await seedInstanceSettings({
        provider: "openai",
        model: "gpt-4o-mini",
        baseURL: "https://stored.example.com/v1",
        apiKeySource: "db",
        apiKeyCiphertext: ciphertext,
      });

      const resolved = await resolveConsumerLlmConfig(
        baseEnv({
          SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
          // Empty string is treated as "no override" (length === 0).
          ADMIN_LLM_BASE_URL: "",
        }),
        secretBox,
        null,
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.baseURL).toBe("https://stored.example.com/v1");
    });
  });

  it("Stub fallback (NullSecretBox decrypt failure): DB has ciphertext but SECRET_BOX_MASTER_KEY is unset → warn-log and keep Stub adapters", async () => {
    await seedInstanceSettings({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      apiKeySource: "db",
      apiKeyCiphertext: "any-value-decrypt-will-fail-via-NullSecretBox",
    });

    const container = await createConsumerContainer(
      baseEnv({
        // No ADMIN_LLM_API_KEY, no SECRET_BOX_MASTER_KEY → NullSecretBox
        // raises KeyUnavailable on decrypt → resolver returns null →
        // Stub adapters remain.
      }),
    );

    expect(container.llmProvider).toBeInstanceOf(StubLLMProvider);
    expect(container.ocrProvider).toBeInstanceOf(StubOCRProvider);
    expect(container.pdfExtractor).toBeInstanceOf(StubPDFExtractor);
  });

  it("Stub fallback: no env apiKey and no DB row → Stub adapters", async () => {
    // No instance_settings row at all (fresh deployment).
    const container = await createConsumerContainer(baseEnv());

    expect(container.llmProvider).toBeInstanceOf(StubLLMProvider);
    expect(container.ocrProvider).toBeInstanceOf(StubOCRProvider);
    expect(container.pdfExtractor).toBeInstanceOf(StubPDFExtractor);
  });

  it("rotation fallback (Issue #370): DB ciphertext under the previous key + new key set → decrypts via SECRET_BOX_MASTER_KEY_PREVIOUS, wires the real adapter", async () => {
    // A distinct previous key. The DB row is encrypted under it (the
    // pre-rotation state); the new key cannot decrypt it directly.
    const PREVIOUS_KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    const previousBox = new WebCryptoSecretBox(PREVIOUS_KEY);
    const ciphertext = await previousBox.encrypt("sk-openai-from-old-key");

    await seedInstanceSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      baseURL: "https://api.openai.com/v1",
      apiKeySource: "db",
      apiKeyCiphertext: ciphertext,
    });

    const container = await createConsumerContainer(
      baseEnv({
        SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
        SECRET_BOX_MASTER_KEY_PREVIOUS: PREVIOUS_KEY,
      }),
    );

    // Old-key row still decrypts via the previous-key fallback → real
    // adapter is wired rather than degrading to Stub.
    expect(container.llmProvider).toBeInstanceOf(OpenAILLMProvider);
  });

  it("rotation gap (Issue #370): DB ciphertext under the previous key but no previous key configured → Stub fallback", async () => {
    const PREVIOUS_KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    const previousBox = new WebCryptoSecretBox(PREVIOUS_KEY);
    const ciphertext = await previousBox.encrypt("sk-openai-from-old-key");

    await seedInstanceSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      baseURL: "https://api.openai.com/v1",
      apiKeySource: "db",
      apiKeyCiphertext: ciphertext,
    });

    const container = await createConsumerContainer(
      baseEnv({
        // New key only, no previous key → old-key row fails to decrypt →
        // warn-log and Stub fallback (existing degradation path).
        SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
      }),
    );

    expect(container.llmProvider).toBeInstanceOf(StubLLMProvider);
  });
});

/**
 * Issue #701 (B-001): symmetric coverage for the consumer-worker speech
 * resolution (`resolveConsumerSpeechConfig` / `createConsumerContainer`'s
 * `speechRecognitionProvider` override). Mirrors the LLM block above —
 * env override > DB resolution > Stub fallback — so the speech path has the
 * same regression防御 as the LLM path it was modeled on. No `baseURL` axis
 * (ADR-003).
 */
describe("createConsumerContainer — speech resolution (env > DB > Stub)", () => {
  it("env override path: ADMIN_SPEECH_API_KEY + ADMIN_SPEECH_MODEL set → wires the real OpenAI speech provider ignoring DB ciphertext", async () => {
    // DB carries a (would-be) db-sourced speech ciphertext; the env override
    // must completely shadow it.
    await seedInstanceSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKeySource: "env",
      speechProvider: "openai",
      speechModel: "stored-speech-model",
      speechApiKeySource: "db",
      speechApiKeyCiphertext: "ignored-because-env-wins",
    });

    const container = await createConsumerContainer(
      baseEnv({
        ADMIN_SPEECH_API_KEY: "sk-speech-env",
        ADMIN_SPEECH_MODEL: "gpt-4o-transcribe",
        ADMIN_SPEECH_PROVIDER: "openai",
      }),
    );

    expect(container.speechRecognitionProvider).toBeInstanceOf(
      OpenAISpeechRecognitionProvider,
    );
  });

  it("DB resolution path: env apiKey absent, DB ciphertext + WebCryptoSecretBox → decrypts and wires the real speech provider", async () => {
    const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
    const ciphertext = await secretBox.encrypt("sk-speech-from-db");

    await seedInstanceSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKeySource: "env",
      speechProvider: "openai",
      speechModel: "gpt-4o-transcribe",
      speechApiKeySource: "db",
      speechApiKeyCiphertext: ciphertext,
    });

    const container = await createConsumerContainer(
      baseEnv({
        // No ADMIN_SPEECH_API_KEY → DB resolution path.
        SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
      }),
    );

    expect(container.speechRecognitionProvider).toBeInstanceOf(
      OpenAISpeechRecognitionProvider,
    );
  });

  it("Stub fallback (NullSecretBox decrypt failure): DB has speech ciphertext but SECRET_BOX_MASTER_KEY unset → warn-log and keep the Stub speech provider", async () => {
    await seedInstanceSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKeySource: "env",
      speechProvider: "openai",
      speechModel: "gpt-4o-transcribe",
      speechApiKeySource: "db",
      speechApiKeyCiphertext: "any-value-decrypt-will-fail-via-NullSecretBox",
    });

    const container = await createConsumerContainer(
      baseEnv({
        // No ADMIN_SPEECH_API_KEY, no SECRET_BOX_MASTER_KEY → NullSecretBox
        // raises on decrypt → resolver returns null → Stub speech remains.
      }),
    );

    expect(container.speechRecognitionProvider).toBeInstanceOf(
      StubSpeechRecognitionProvider,
    );
  });

  it("Stub fallback: speech model missing (DB row has NULL speech_model) → Stub speech provider", async () => {
    // The `||` short-circuit in the resolver's null-coalescing means a
    // missing model collapses the whole resolution to `null` (Stub). This
    // also guards against an `&&`→`||` mutation in the final guard.
    const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
    const ciphertext = await secretBox.encrypt("sk-speech-from-db");
    await seedInstanceSettings({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKeySource: "env",
      speechProvider: "openai",
      speechModel: null,
      speechApiKeySource: "db",
      speechApiKeyCiphertext: ciphertext,
    });

    const container = await createConsumerContainer(
      baseEnv({
        SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
      }),
    );

    expect(container.speechRecognitionProvider).toBeInstanceOf(
      StubSpeechRecognitionProvider,
    );
  });

  it("Stub fallback: no env apiKey and no DB row → Stub speech provider", async () => {
    const container = await createConsumerContainer(baseEnv());
    expect(container.speechRecognitionProvider).toBeInstanceOf(
      StubSpeechRecognitionProvider,
    );
  });

  // Calling `resolveConsumerSpeechConfig` directly exposes which values were
  // resolved (`instanceof` only proves "real vs Stub", not the env>db
  // priority on each axis). This pins the resolution decision at the seam.
  describe("resolveConsumerSpeechConfig — env > DB priority per axis", () => {
    it("env provider/model win over the DB row; apiKey decrypts from the DB ciphertext", async () => {
      const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
      const ciphertext = await secretBox.encrypt("sk-speech-from-db");
      await seedInstanceSettings({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKeySource: "env",
        speechProvider: "openai",
        speechModel: "stored-speech-model",
        speechApiKeySource: "db",
        speechApiKeyCiphertext: ciphertext,
      });

      const resolved = await resolveConsumerSpeechConfig(
        baseEnv({
          SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
          ADMIN_SPEECH_PROVIDER: "openai",
          ADMIN_SPEECH_MODEL: "gpt-4o-transcribe",
          // No ADMIN_SPEECH_API_KEY → apiKey resolves from the DB ciphertext.
        }),
        secretBox,
        null,
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.provider).toBe("openai");
      // env model beats the stored model.
      expect(resolved?.model).toBe("gpt-4o-transcribe");
      // apiKey came from decrypting the DB ciphertext, not from env.
      expect(resolved?.apiKey).toBe("sk-speech-from-db");
    });

    it("env ADMIN_SPEECH_API_KEY (non-empty) wins over the DB ciphertext", async () => {
      const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
      const ciphertext = await secretBox.encrypt("sk-speech-from-db");
      await seedInstanceSettings({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKeySource: "env",
        speechProvider: "openai",
        speechModel: "gpt-4o-transcribe",
        speechApiKeySource: "db",
        speechApiKeyCiphertext: ciphertext,
      });

      const resolved = await resolveConsumerSpeechConfig(
        baseEnv({
          SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
          ADMIN_SPEECH_API_KEY: "sk-speech-env",
        }),
        secretBox,
        null,
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.apiKey).toBe("sk-speech-env");
    });

    it("falls back to the DB model when ADMIN_SPEECH_MODEL is empty (length===0 → no override)", async () => {
      const secretBox = new WebCryptoSecretBox(TEST_SECRET_BOX_KEY);
      const ciphertext = await secretBox.encrypt("sk-speech-from-db");
      await seedInstanceSettings({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKeySource: "env",
        speechProvider: "openai",
        speechModel: "stored-speech-model",
        speechApiKeySource: "db",
        speechApiKeyCiphertext: ciphertext,
      });

      const resolved = await resolveConsumerSpeechConfig(
        baseEnv({
          SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY,
          // Empty string is treated as "no override" (length === 0).
          ADMIN_SPEECH_MODEL: "",
        }),
        secretBox,
        null,
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.model).toBe("stored-speech-model");
    });

    it("returns null (Stub fallback) when no env apiKey and the DB ciphertext is absent", async () => {
      await seedInstanceSettings({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKeySource: "env",
        speechProvider: "openai",
        speechModel: "gpt-4o-transcribe",
        speechApiKeySource: "env",
        speechApiKeyCiphertext: null,
      });

      const resolved = await resolveConsumerSpeechConfig(
        baseEnv({ SECRET_BOX_MASTER_KEY: TEST_SECRET_BOX_KEY }),
        new WebCryptoSecretBox(TEST_SECRET_BOX_KEY),
        null,
      );

      // provider + model resolve but apiKey is null → whole config is null.
      expect(resolved).toBeNull();
    });

    it("returns null on decrypt failure (NullSecretBox raises) → Stub fallback", async () => {
      await seedInstanceSettings({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKeySource: "env",
        speechProvider: "openai",
        speechModel: "gpt-4o-transcribe",
        speechApiKeySource: "db",
        speechApiKeyCiphertext: "cannot-decrypt-without-a-key",
      });

      const { NullSecretBox } = await import(
        "@/core/adapters/security/secretBox"
      );
      const resolved = await resolveConsumerSpeechConfig(
        baseEnv(),
        new NullSecretBox(),
        null,
      );

      expect(resolved).toBeNull();
    });
  });
});
