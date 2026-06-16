import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1ActivityLogRepository } from "@/core/adapters/d1/repositories/activityLogRepository";
import { getDatabase } from "@/core/adapters/d1/client";
import { isForbiddenError } from "../../errors";
import { createTestContainer } from "../../__tests__/helpers";
import { getRecentActivity } from "../getRecentActivity";

/**
 * Integration tests for `getRecentActivity` (Issue #595): admin gate, empty
 * state (freshly-deployed table → honest empty `rows`, which is what lets the
 * dashboard render the "アクティビティはまだありません" filler while the
 * "すべて見る" link stays omitted — AC-8 / S-002-coverage), and recent-first
 * projection.
 */

const ADMIN_ID = "01950000-0000-7000-8000-00000000ad01";
const MEMBER_ID = "01950000-0000-7000-8000-00000000be02";
const NOW = "2026-06-17T00:00:00.000Z";

async function seedUser(
  id: string,
  username: string,
  role: "admin" | "member",
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, email_verified, image, created_at,
       updated_at, username, display_username, role, banned, ban_reason,
       ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?, ?, NULL, ?, 0, NULL, NULL, NULL, NULL, NULL, NULL)`,
  )
    .bind(id, username, `${id}@example.com`, NOW, NOW, username, role)
    .run();
}

describe("getRecentActivity", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM users"),
      env.DB.prepare("DELETE FROM activity_log"),
      env.DB.prepare("DELETE FROM ingestion_burst_log"),
    ]);
  });

  it("rejects non-admin actors", async () => {
    await seedUser(MEMBER_ID, "bob", "member");
    const container = createTestContainer();
    let caught: unknown;
    try {
      await getRecentActivity({
        container,
        input: { actorUserId: MEMBER_ID },
      });
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });

  it("returns an empty rows array on a fresh (empty) table", async () => {
    await seedUser(ADMIN_ID, "alice", "admin");
    const container = createTestContainer();
    const out = await getRecentActivity({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(out.rows).toEqual([]);
  });

  it("projects rows recent-first with serialized occurredAt", async () => {
    await seedUser(ADMIN_ID, "alice", "admin");
    const repo = new D1ActivityLogRepository(getDatabase(env.DB));
    await repo.insertIfAbsent({
      id: "row-1",
      eventId: "evt-old",
      kind: "settings_changed",
      actorId: ADMIN_ID,
      target: "登録ポリシー",
      detail: "登録を停止",
      severity: "info",
      occurredAt: new Date("2026-06-17T08:00:00.000Z"),
      createdAt: new Date("2026-06-17T08:00:00.000Z"),
    });
    await repo.insertIfAbsent({
      id: "row-2",
      eventId: "evt-new",
      kind: "user_created",
      actorId: ADMIN_ID,
      target: "@carol",
      detail: "新規ユーザー",
      severity: "success",
      occurredAt: new Date("2026-06-17T10:00:00.000Z"),
      createdAt: new Date("2026-06-17T10:00:00.000Z"),
    });

    const container = createTestContainer();
    const out = await getRecentActivity({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]?.kind).toBe("user_created");
    expect(out.rows[0]?.occurredAt).toBe("2026-06-17T10:00:00.000Z");
    expect(out.rows[1]?.kind).toBe("settings_changed");
  });
});
