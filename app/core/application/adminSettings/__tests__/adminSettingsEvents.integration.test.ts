import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestContainer } from "../../__tests__/helpers";
import { resetAllPromptTemplates } from "../resetAllPromptTemplates";
import { resetDesignTokens } from "../resetDesignTokens";
import { resetPromptTemplate } from "../resetPromptTemplate";
import { toggleRegistrationPolicy } from "../toggleRegistrationPolicy";
import { updateDesignTokens } from "../updateDesignTokens";
import { updateInstanceLimits } from "../updateInstanceLimits";
import { updateLLMConfig } from "../updateLLMConfig";
import { updatePromptTemplate } from "../updatePromptTemplate";
import { updateSpeechConfig } from "../updateSpeechConfig";

/**
/**
 * Verify that every emitting adminSettings usecase collects an
 * `instance_settings.updated` domain event with the correct `settingKind`,
 * and that the no-op-guarded usecases do NOT emit when the change is a
 * logical no-op. The event is written transactionally to the outbox inside
 * the UoW. Covering all six settingKinds — not just a couple — is what
 * structurally prevents "one usecase emits but another silently stops"
 * regressions.
 */

const ADMIN_ID = "01950000-0000-7000-8000-00000000ad01";
const NOW = new Date("2026-06-17T00:00:00.000Z").toISOString();

async function seedAdmin(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, email_verified, image, created_at,
       updated_at, username, display_username, role, banned, ban_reason,
       ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?, ?, NULL, 'admin', 0, NULL, NULL, NULL, NULL, NULL, NULL)`,
  )
    .bind(ADMIN_ID, "alice", "alice@example.com", NOW, NOW, "alice")
    .run();
}

type OutboxRow = {
  event_type: string;
  payload: string;
};

async function readOutbox(): Promise<OutboxRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT event_type, payload FROM outbox_events ORDER BY created_at ASC",
  ).all<OutboxRow>();
  return results;
}

async function settingsUpdates(): Promise<OutboxRow[]> {
  const rows = await readOutbox();
  return rows.filter((r) => r.event_type === "instance_settings.updated");
}

describe("adminSettings usecases emit instance_settings.updated", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM outbox_events"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare("DELETE FROM instance_settings"),
    ]);
    await seedAdmin();
  });

  it("toggleRegistrationPolicy emits settingKind=registration_policy", async () => {
    const container = createTestContainer();
    await toggleRegistrationPolicy({
      container,
      input: {
        actorUserId: ADMIN_ID,
        open: false,
        closedReason: "maintenance",
      },
    });

    const updated = await settingsUpdates();
    expect(updated).toHaveLength(1);
    const payload = JSON.parse(updated[0]?.payload ?? "{}");
    expect(payload.settingKind).toBe("registration_policy");
    // actorId is now a branded UserId carried as the serialized string.
    expect(payload.actorId).toBe(ADMIN_ID);
    expect(typeof payload.summary).toBe("string");
  });

  it("updateLLMConfig emits settingKind=llm_config", async () => {
    const container = createTestContainer();
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-secret",
      },
    });

    const updated = await settingsUpdates();
    expect(updated).toHaveLength(1);
    expect(JSON.parse(updated[0]?.payload ?? "{}").settingKind).toBe(
      "llm_config",
    );
  });

  it("updateSpeechConfig emits settingKind=speech_config", async () => {
    const container = createTestContainer();
    await updateSpeechConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "whisper-1",
        apiKeyPlain: "sk-secret",
      },
    });

    const updated = await settingsUpdates();
    expect(updated).toHaveLength(1);
    expect(JSON.parse(updated[0]?.payload ?? "{}").settingKind).toBe(
      "speech_config",
    );
  });

  it("updatePromptTemplate emits settingKind=prompt_template", async () => {
    const container = createTestContainer();
    await updatePromptTemplate({
      container,
      input: {
        actorUserId: ADMIN_ID,
        purpose: "title",
        template: {
          text: "Title: {{ name }}",
          expectedVariables: ["name"],
        },
      },
    });

    const updated = await settingsUpdates();
    expect(updated).toHaveLength(1);
    expect(JSON.parse(updated[0]?.payload ?? "{}").settingKind).toBe(
      "prompt_template",
    );
  });

  it("updateInstanceLimits emits settingKind=instance_limits", async () => {
    const container = createTestContainer();
    await updateInstanceLimits({
      container,
      input: {
        actorUserId: ADMIN_ID,
        limits: {
          maxUploadBytesPerDay: 1024,
          maxIngestionBytes: 1024,
          maxNoteBytes: 1024,
          maxExportArtifactBytes: 1024,
          maxShareLinksPerNote: 5,
          editLockTtlSec: 60,
          trashRetentionDays: 30,
          maxNoteRevisionsPerNote: 10,
        },
      },
    });

    const updated = await settingsUpdates();
    expect(updated).toHaveLength(1);
    expect(JSON.parse(updated[0]?.payload ?? "{}").settingKind).toBe(
      "instance_limits",
    );
  });

  it("updateDesignTokens emits settingKind=design_tokens", async () => {
    const container = createTestContainer();
    await updateDesignTokens({
      container,
      input: {
        actorUserId: ADMIN_ID,
        // A genuine override (differs from the built-in default) so the
        // entity records a change and the event is emitted.
        tokens: { "--color-accent": "oklch(50% 0.1 30)" },
      },
    });

    const updated = await settingsUpdates();
    expect(updated).toHaveLength(1);
    expect(JSON.parse(updated[0]?.payload ?? "{}").settingKind).toBe(
      "design_tokens",
    );
  });
});

describe("adminSettings no-op guards do not emit", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM outbox_events"),
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare("DELETE FROM instance_settings"),
    ]);
    await seedAdmin();
  });

  it("updateDesignTokens with no actual override change does not emit", async () => {
    const container = createTestContainer();
    // Fresh settings hold no design-token overrides, so persisting an empty
    // override set is a logical no-op — the guard (`next === current`) must
    // suppress the event.
    await updateDesignTokens({
      container,
      input: { actorUserId: ADMIN_ID, tokens: {} },
    });

    expect(await settingsUpdates()).toHaveLength(0);
  });

  it("updateDesignTokens re-saving the same override does not emit twice", async () => {
    const container = createTestContainer();
    const input = {
      actorUserId: ADMIN_ID,
      tokens: { "--color-accent": "oklch(50% 0.1 30)" },
    };
    await updateDesignTokens({ container, input });
    // The identical re-save is a no-op (`designTokensEqual` short-circuit).
    await updateDesignTokens({ container, input });

    expect(await settingsUpdates()).toHaveLength(1);
  });

  it("resetDesignTokens with no existing override does not emit", async () => {
    const container = createTestContainer();
    // Fresh settings hold no design-token overrides, so resetting to empty is
    // a logical no-op — the domain `resetDesignTokens` short-circuits
    // (`next === current`) and the usecase guard must suppress the event
    // (symmetric with resetAllPromptTemplates).
    await resetDesignTokens({
      container,
      input: { actorUserId: ADMIN_ID },
    });

    expect(await settingsUpdates()).toHaveLength(0);
  });

  it("resetPromptTemplate with no existing override does not emit", async () => {
    const container = createTestContainer();
    await resetPromptTemplate({
      container,
      input: { actorUserId: ADMIN_ID, purpose: "title" },
    });

    expect(await settingsUpdates()).toHaveLength(0);
  });

  it("resetAllPromptTemplates with no existing overrides does not emit", async () => {
    const container = createTestContainer();
    await resetAllPromptTemplates({
      container,
      input: { actorUserId: ADMIN_ID },
    });

    expect(await settingsUpdates()).toHaveLength(0);
  });

  it("updatePromptTemplate re-saving the same template does not emit twice", async () => {
    const container = createTestContainer();
    const input = {
      actorUserId: ADMIN_ID,
      purpose: "title",
      template: {
        text: "Title: {{ name }}",
        expectedVariables: ["name"],
      },
    };
    await updatePromptTemplate({ container, input });
    // First write emits; the identical re-save is a no-op (`next === current`).
    await updatePromptTemplate({ container, input });

    expect(await settingsUpdates()).toHaveLength(1);
  });
});
