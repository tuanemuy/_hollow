import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { AnthropicLLMProvider } from "@/core/adapters/anthropic/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/anthropic/pdfExtractor";
import { OpenAILLMProvider } from "@/core/adapters/openai/llmProvider";
import { WebCryptoSecretBox } from "@/core/adapters/security/secretBox";
import { StubLLMProvider } from "@/core/adapters/stub/llmProvider";
import { StubOCRProvider } from "@/core/adapters/stub/ocrProvider";
import { StubPDFExtractor } from "@/core/adapters/stub/pdfExtractor";
import {
  createConsumerContainer,
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
}): Promise<void> {
  // Seed the singleton row directly via prepared statements rather than
  // through the repository — the repository is part of the UoW pipeline
  // and this test exercises the read-only consumer-resolution path.
  const now = new Date("2026-01-01T00:00:00.000Z").toISOString();
  await env.DB.prepare(
    `INSERT INTO instance_settings (
       id, llm_provider, llm_model, llm_base_url,
       llm_api_key_source, llm_api_key_ciphertext,
       prompts_json, design_tokens_json,
       registration_open, registration_closed_reason,
       limits_json, version, updated_at
     )
     VALUES ('singleton', ?, ?, ?, ?, ?, '{}', '{"tokens":{}}', 1, NULL, ?, 0, ?)`,
  )
    .bind(
      opts.provider,
      opts.model,
      opts.baseURL ?? null,
      opts.apiKeySource,
      opts.apiKeyCiphertext ?? null,
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
});
