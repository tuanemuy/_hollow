import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestContainer } from "../../__tests__/helpers";
import { toggleRegistrationPolicy } from "../toggleRegistrationPolicy";
import { updateInstanceLimits } from "../updateInstanceLimits";

/**
 * Issue #595 (B-6): verify the emitting adminSettings usecases collect an
 * `instance_settings.updated` domain event with the correct `settingKind`.
 * The event is written transactionally to the outbox inside the UoW.
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

    const rows = await readOutbox();
    const updated = rows.filter(
      (r) => r.event_type === "instance_settings.updated",
    );
    expect(updated).toHaveLength(1);
    const payload = JSON.parse(updated[0]?.payload ?? "{}");
    expect(payload.settingKind).toBe("registration_policy");
    expect(payload.actorId).toBe(ADMIN_ID);
    expect(typeof payload.summary).toBe("string");
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

    const rows = await readOutbox();
    const updated = rows.filter(
      (r) => r.event_type === "instance_settings.updated",
    );
    expect(updated).toHaveLength(1);
    expect(JSON.parse(updated[0]?.payload ?? "{}").settingKind).toBe(
      "instance_limits",
    );
  });
});
