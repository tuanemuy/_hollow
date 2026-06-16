import { describe, expect, it } from "vitest";
import type { Clock } from "@/core/application/ports/clock";
import type { UserId } from "@/core/domain/identity/valueObject";
import { D1UsageMetricsProvider } from "../repositories/usageMetricsProvider";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1UsageMetricsProvider` (Issue #595, PR-A):
 * hourly upload aggregation over the last 24h, zero-filling of empty
 * buckets, the partial-failure `null` degrade, and the invariant that
 * scalar fields stay `null` (existing four metric-card behaviour, #545).
 */

const NOW = new Date("2026-06-10T12:30:00.000Z");

function fixedClock(now: Date): Clock {
  return { now: () => now };
}

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e8f0-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Usage Metrics Test",
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    username: `u-${id.slice(9, 13)}`,
    displayUsername: null,
    role: "member",
    banned: 0,
    banReason: null,
    banExpires: null,
    bio: null,
    avatarMediaId: null,
  });
  return id as UserId;
}

async function seedJob(
  container: TestContainer,
  ownerId: UserId,
  createdAt: Date,
): Promise<void> {
  const id = nextId(0x02);
  const iso = createdAt.toISOString();
  await container.db.insert(schema.ingestionJobs).values({
    id,
    ownerId,
    originalFileName: "upload.md",
    mimeType: "text/markdown",
    byteSize: 16,
    kind: "markdown",
    status: "saved",
    tempStorageKey: null,
    structurePromptOverride: null,
    metadataPromptOverride: null,
    previewJson: null,
    errorCode: null,
    errorReason: null,
    regenerationCount: 0,
    savedAsNoteId: null,
    version: 0,
    createdAt: iso,
    updatedAt: iso,
  });
}

describe("D1UsageMetricsProvider (integration)", () => {
  it("returns 24 hourly buckets oldest-first, keyed by UTC hour start", async () => {
    const container = createTestContainer();
    const provider = new D1UsageMetricsProvider(container.db, fixedClock(NOW));

    const snapshot = await provider.collect();
    expect(snapshot.uploadsHourly).not.toBeNull();
    const series = snapshot.uploadsHourly ?? [];
    expect(series).toHaveLength(24);
    // Oldest bucket is 23 hours before the current hour start (12:00Z).
    expect(series[0]?.hourStart.toISOString()).toBe("2026-06-09T13:00:00.000Z");
    expect(series[23]?.hourStart.toISOString()).toBe(
      "2026-06-10T12:00:00.000Z",
    );
  });

  it("zero-fills every bucket when the table is empty", async () => {
    const container = createTestContainer();
    const provider = new D1UsageMetricsProvider(container.db, fixedClock(NOW));

    const snapshot = await provider.collect();
    const series = snapshot.uploadsHourly ?? [];
    expect(series).toHaveLength(24);
    expect(series.every((point) => point.count === 0)).toBe(true);
  });

  it("aggregates jobs into their UTC hour bucket and zero-fills the rest", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    // Three jobs in the 10:00Z hour, one in the 12:00Z (current) hour.
    await seedJob(container, owner, new Date("2026-06-10T10:05:00.000Z"));
    await seedJob(container, owner, new Date("2026-06-10T10:45:00.000Z"));
    await seedJob(container, owner, new Date("2026-06-10T10:59:59.000Z"));
    await seedJob(container, owner, new Date("2026-06-10T12:10:00.000Z"));
    // Outside the 24h window — must not be counted.
    await seedJob(container, owner, new Date("2026-06-09T11:00:00.000Z"));

    const provider = new D1UsageMetricsProvider(container.db, fixedClock(NOW));
    const snapshot = await provider.collect();
    const series = snapshot.uploadsHourly ?? [];

    const byHour = new Map(
      series.map((point) => [point.hourStart.toISOString(), point.count]),
    );
    expect(byHour.get("2026-06-10T10:00:00.000Z")).toBe(3);
    expect(byHour.get("2026-06-10T12:00:00.000Z")).toBe(1);
    // Out-of-window job's hour bucket is not even present in the series.
    expect(byHour.has("2026-06-09T11:00:00.000Z")).toBe(false);
    // Everything else is zero-filled.
    const total = series.reduce((acc, point) => acc + point.count, 0);
    expect(total).toBe(4);
  });

  it("degrades the series to null when the query fails (partial-failure contract)", async () => {
    const container = createTestContainer();
    // A provider whose `db.select` throws simulates a metric-source outage.
    const brokenDb = {
      select() {
        throw new Error("simulated D1 outage");
      },
    } as unknown as typeof container.db;
    const provider = new D1UsageMetricsProvider(brokenDb, fixedClock(NOW));

    // Must not throw — the contract is "never throw, degrade to null".
    const snapshot = await provider.collect();
    expect(snapshot.uploadsHourly).toBeNull();
  });

  it("keeps scalar fields null so existing metric cards are unchanged (#545)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedJob(container, owner, new Date("2026-06-10T10:05:00.000Z"));
    const provider = new D1UsageMetricsProvider(container.db, fixedClock(NOW));

    const snapshot = await provider.collect();
    expect(snapshot.userCount).toBeNull();
    expect(snapshot.storageDurableObjectBytes).toBeNull();
    expect(snapshot.storageR2Bytes).toBeNull();
    expect(snapshot.uploadsToday).toBeNull();
    expect(snapshot.llmCallsToday).toBeNull();
    expect(snapshot.alerts).toEqual([]);
    // ...but the hourly series IS populated.
    expect(snapshot.uploadsHourly).not.toBeNull();
  });
});
