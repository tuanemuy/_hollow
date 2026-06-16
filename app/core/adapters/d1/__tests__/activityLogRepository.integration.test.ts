import { describe, expect, it } from "vitest";
import {
  LARGE_UPLOAD_THRESHOLD,
  LARGE_UPLOAD_WINDOW_MINUTES,
} from "@/core/application/activityLog/types";
import { D1ActivityLogRepository } from "../repositories/activityLogRepository";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1ActivityLogRepository` (Issue #595):
 * projection idempotency, recent-first read ordering, the burst read-time
 * aggregation boundary, and retention pruning.
 */

let counter = 0;
const nextId = (): string => {
  counter += 1;
  const block = counter.toString(16).padStart(8, "0");
  return `0193e9a0-${block.slice(0, 4)}-7000-8000-${block.padStart(12, "0")}`;
};

const TZ = "2026-06-01T00:00:00.000Z";

async function seedUser(
  container: TestContainer,
  username: string,
): Promise<string> {
  const id = nextId();
  await container.db.insert(schema.users).values({
    id,
    name: username,
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username,
    displayUsername: null,
    role: "member",
    banned: 0,
    banReason: null,
    banExpires: null,
    bio: null,
    avatarMediaId: null,
  });
  return id;
}

function repo(container: TestContainer): D1ActivityLogRepository {
  return new D1ActivityLogRepository(container.db);
}

describe("D1ActivityLogRepository.insertIfAbsent", () => {
  it("is idempotent on eventId — a duplicate dispatch produces no second row", async () => {
    const container = createTestContainer();
    const r = repo(container);
    const eventId = nextId();
    const entry = {
      id: nextId(),
      eventId,
      kind: "user_created" as const,
      actorId: null,
      target: "@alice",
      detail: "新規ユーザー",
      severity: "success" as const,
      occurredAt: new Date("2026-06-17T10:00:00.000Z"),
      createdAt: new Date("2026-06-17T10:00:01.000Z"),
    };

    await r.insertIfAbsent(entry);
    // Same eventId, different row id — must NOT create a second row.
    await r.insertIfAbsent({ ...entry, id: nextId() });

    const rows = await r.findRecent(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.target).toBe("@alice");
  });
});

describe("D1ActivityLogRepository.findRecent", () => {
  it("returns rows occurredAt-descending and respects the limit", async () => {
    const container = createTestContainer();
    const r = repo(container);
    const times = [
      "2026-06-17T08:00:00.000Z",
      "2026-06-17T10:00:00.000Z",
      "2026-06-17T09:00:00.000Z",
    ];
    for (const t of times) {
      await r.insertIfAbsent({
        id: nextId(),
        eventId: nextId(),
        kind: "settings_changed",
        actorId: null,
        target: t,
        detail: "",
        severity: "info",
        occurredAt: new Date(t),
        createdAt: new Date(t),
      });
    }

    const rows = await r.findRecent(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.occurredAt.toISOString()).toBe("2026-06-17T10:00:00.000Z");
    expect(rows[1]?.occurredAt.toISOString()).toBe("2026-06-17T09:00:00.000Z");
  });

  it("returns an empty array on a freshly-deployed (empty) table", async () => {
    const container = createTestContainer();
    const rows = await repo(container).findRecent(10);
    expect(rows).toEqual([]);
  });
});

describe("D1ActivityLogRepository burst aggregation (大量アップロード)", () => {
  async function seedBurst(
    container: TestContainer,
    ownerId: string,
    count: number,
    baseIso: string,
  ): Promise<void> {
    const r = repo(container);
    const base = new Date(baseIso).getTime();
    for (let i = 0; i < count; i += 1) {
      // All within the same window (1s apart, far under the window width).
      const occurredAt = new Date(base + i * 1000);
      await r.recordBurst({
        id: nextId(),
        eventId: nextId(),
        ownerId,
        hourBucket: occurredAt.toISOString().slice(0, 13),
        occurredAt,
      });
    }
  }

  it("does NOT surface a large_upload row below the threshold", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "k_okada");
    await seedBurst(
      container,
      owner,
      LARGE_UPLOAD_THRESHOLD - 1,
      "2026-06-17T12:00:00.000Z",
    );

    const rows = await repo(container).findRecent(10);
    expect(rows.filter((row) => row.kind === "large_upload")).toHaveLength(0);
  });

  it("surfaces exactly one large_upload row at the threshold, with the owner handle", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "k_okada");
    await seedBurst(
      container,
      owner,
      LARGE_UPLOAD_THRESHOLD,
      "2026-06-17T12:00:00.000Z",
    );

    const rows = await repo(container).findRecent(10);
    const bursts = rows.filter((row) => row.kind === "large_upload");
    expect(bursts).toHaveLength(1);
    expect(bursts[0]?.target).toBe("k_okada");
    expect(bursts[0]?.detail).toContain(String(LARGE_UPLOAD_THRESHOLD));
  });

  it("recordBurst is idempotent on eventId — re-delivery does not inflate the count", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "k_okada");
    const r = repo(container);
    const base = new Date("2026-06-17T12:00:00.000Z").getTime();
    // Insert exactly THRESHOLD distinct events, then re-deliver each once.
    for (let i = 0; i < LARGE_UPLOAD_THRESHOLD; i += 1) {
      const eventId = nextId();
      const occurredAt = new Date(base + i * 1000);
      const entry = {
        id: nextId(),
        eventId,
        ownerId: owner,
        hourBucket: occurredAt.toISOString().slice(0, 13),
        occurredAt,
      };
      await r.recordBurst(entry);
      await r.recordBurst({ ...entry, id: nextId() }); // duplicate eventId
    }

    const rows = await r.findRecent(10);
    const bursts = rows.filter((row) => row.kind === "large_upload");
    expect(bursts).toHaveLength(1);
    // Count reflects DISTINCT events, not the doubled re-delivery.
    expect(bursts[0]?.detail).toContain(String(LARGE_UPLOAD_THRESHOLD));
  });

  it("does not merge uploads across separate windows", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "k_okada");
    // Two clusters each just under threshold, separated by more than the
    // window width — neither cluster alone reaches the threshold.
    const half = Math.ceil(LARGE_UPLOAD_THRESHOLD / 2);
    await seedBurst(container, owner, half, "2026-06-17T12:00:00.000Z");
    await seedBurst(
      container,
      owner,
      half,
      `2026-06-17T12:${String(LARGE_UPLOAD_WINDOW_MINUTES + 1).padStart(2, "0")}:00.000Z`,
    );

    const rows = await repo(container).findRecent(10);
    // Each cluster is below threshold on its own, so no burst row appears
    // (half < THRESHOLD for THRESHOLD >= 2).
    expect(rows.filter((row) => row.kind === "large_upload")).toHaveLength(0);
  });
});

describe("D1ActivityLogRepository pruning", () => {
  it("pruneOlderThan removes rows before the cutoff and keeps newer ones", async () => {
    const container = createTestContainer();
    const r = repo(container);
    const old = new Date("2026-01-01T00:00:00.000Z");
    const fresh = new Date("2026-06-17T00:00:00.000Z");
    for (const at of [old, fresh]) {
      await r.insertIfAbsent({
        id: nextId(),
        eventId: nextId(),
        kind: "settings_changed",
        actorId: null,
        target: at.toISOString(),
        detail: "",
        severity: "info",
        occurredAt: at,
        createdAt: at,
      });
    }

    const { deleted } = await r.pruneOlderThan(
      new Date("2026-03-01T00:00:00.000Z"),
    );
    expect(deleted).toBe(1);
    const rows = await r.findRecent(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.occurredAt.toISOString()).toBe(fresh.toISOString());
  });

  it("pruneBurstOlderThan removes burst rows before the cutoff", async () => {
    const container = createTestContainer();
    const r = repo(container);
    const owner = await seedUser(container, "k_okada");
    const old = new Date("2026-06-15T00:00:00.000Z");
    const fresh = new Date("2026-06-17T00:00:00.000Z");
    for (const at of [old, fresh]) {
      await r.recordBurst({
        id: nextId(),
        eventId: nextId(),
        ownerId: owner,
        hourBucket: at.toISOString().slice(0, 13),
        occurredAt: at,
      });
    }

    const { deleted } = await r.pruneBurstOlderThan(
      new Date("2026-06-16T00:00:00.000Z"),
    );
    expect(deleted).toBe(1);
  });
});
