import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import { SystemClock } from "@/core/application/ports/clock";
import { getDatabase } from "../client";
import { PendingBatch } from "../pendingBatch";
import { D1InstanceSettingsRepository } from "../repositories/instanceSettingsRepository";

/**
 * Issue #701 (W-001): direct read-direction coverage for the speech columns
 * of `instanceSettingsRepository.toEntity`. The `save` write-direction is
 * already exercised by `adminSettings.integration.test.ts` (it asserts the
 * persisted `speech_*` columns); this file pins the inverse — DB row →
 * `SpeechRecognitionConfig` reconstruction — including the `db` + NULL
 * ciphertext degeneration into a `DataIntegrityError`.
 *
 * Rows are seeded via raw SQL so the read-only `get()` path is tested
 * without dragging in the UoW / save pipeline.
 */
async function truncateInstanceSettings(): Promise<void> {
  await env.DB.prepare("DELETE FROM instance_settings").run();
}

async function seedRow(opts: {
  speechProvider?: string;
  speechModel?: string | null;
  speechApiKeySource?: "env" | "db";
  speechApiKeyCiphertext?: string | null;
}): Promise<void> {
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
     VALUES ('singleton', 'openai', 'gpt-4o-mini', NULL, 'env', NULL,
             ?, ?, ?, ?, '{}', '{"tokens":{}}', 1, NULL, ?, 3, ?)`,
  )
    .bind(
      opts.speechProvider ?? "openai",
      opts.speechModel ?? null,
      opts.speechApiKeySource ?? "env",
      opts.speechApiKeyCiphertext ?? null,
      // `reconstruct` validates the limits as positive integers, so the
      // seeded JSON must carry valid (non-zero) values.
      JSON.stringify({
        maxUploadBytesPerDay: 1048576,
        maxIngestionBytes: 1048576,
        maxNoteBytes: 1048576,
        maxExportArtifactBytes: 1048576,
        maxShareLinksPerNote: 5,
        editLockTtlSec: 300,
        trashRetentionDays: 30,
      }),
      now,
    )
    .run();
}

function buildRepository(): D1InstanceSettingsRepository {
  const db = getDatabase(env.DB);
  return new D1InstanceSettingsRepository(
    db,
    new PendingBatch(db),
    SystemClock,
  );
}

beforeEach(async () => {
  await truncateInstanceSettings();
});

describe("D1InstanceSettingsRepository.get — speech read direction (W-001)", () => {
  it("maps db-sourced speech columns into the SpeechRecognitionConfig", async () => {
    await seedRow({
      speechProvider: "openai",
      speechModel: "gpt-4o-transcribe",
      speechApiKeySource: "db",
      speechApiKeyCiphertext: "speech-ciphertext-XYZ",
    });

    const { entity } = await buildRepository().get();

    expect(entity.speech.provider).toBe("openai");
    expect(entity.speech.model).toBe("gpt-4o-transcribe");
    expect(entity.speech.apiKeySource).toBe("db");
    expect(entity.speech.apiKeyCiphertext).toBe("speech-ciphertext-XYZ");
  });

  it("maps env-sourced speech columns (NULL ciphertext) into the config", async () => {
    await seedRow({
      speechProvider: "openai",
      speechModel: "gpt-4o-transcribe",
      speechApiKeySource: "env",
      speechApiKeyCiphertext: null,
    });

    const { entity } = await buildRepository().get();

    expect(entity.speech.apiKeySource).toBe("env");
    expect(entity.speech.apiKeyCiphertext).toBeNull();
    expect(entity.speech.model).toBe("gpt-4o-transcribe");
  });

  it("coerces a NULL speech_model (legacy / pre-#701 row) to the default model", async () => {
    // ADR-004: existing singleton rows predate the speech columns and carry a
    // NULL model; `reconstruct`'s `coerceSpeech` substitutes the default.
    await seedRow({
      speechProvider: "openai",
      speechModel: null,
      speechApiKeySource: "env",
      speechApiKeyCiphertext: null,
    });

    const { entity } = await buildRepository().get();

    expect(entity.speech.model).toBe("gpt-4o-transcribe");
    expect(entity.speech.apiKeySource).toBe("env");
  });

  it("throws DataIntegrityError when speech_api_key_source='db' but the ciphertext is NULL", async () => {
    // An illegal stored shape — `SpeechRecognitionConfig.create` rejects
    // `db` + NULL ciphertext, the rehydration error is caught in `toEntity`
    // and re-thrown as a SystemError(DataIntegrityError) rather than leaking
    // the raw BusinessRuleError.
    await seedRow({
      speechProvider: "openai",
      speechModel: "gpt-4o-transcribe",
      speechApiKeySource: "db",
      speechApiKeyCiphertext: null,
    });

    let caught: unknown;
    try {
      await buildRepository().get();
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SystemError);
    expect((caught as SystemError).code).toBe(
      SystemErrorCode.DataIntegrityError,
    );
  });
});
