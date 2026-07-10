import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId, MediaKind } from "@/core/domain/media/valueObject";
import { purgeOrphans } from "../purgeOrphans";
import { sweepAbandonedSourceIntakes } from "../sweepAbandonedSourceIntakes";

// spec: spec/testcases/media/index.md#SweepAbandonedSourceIntakes
//
// The sweep is timestamp-driven (24h grace window by default) like
// `purgeOrphans`, so these tests pin `container.clock` and drive the
// grace window explicitly. The candidate cutoff is a strict `<` on
// `updatedAt`, so tests that chain sweep → purge advance the clock
// between the two calls to avoid same-instant flakes (see
// `purgeOrphans.integration.test.ts` for the pattern).

const SWEEP_TIME = new Date("2026-05-15T12:00:00.000Z");
const TZ = SWEEP_TIME.toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

let userSeq = 0;
let mediaSeq = 0;

function nextUserId(): UserId {
  userSeq += 1;
  return `019e4000-0000-7000-8000-${userSeq.toString(16).padStart(12, "0")}` as UserId;
}

function nextMediaId(): MediaAssetId {
  mediaSeq += 1;
  return `019e5000-0000-7000-8000-${mediaSeq.toString(16).padStart(12, "0")}` as MediaAssetId;
}

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextUserId();
  const suffix = id.slice(-12);
  await container.db.insert(schema.users).values({
    id: id as unknown as string,
    name: `user-${suffix}`,
    email: `user-${suffix}@example.test`,
    emailVerified: 1,
    username: `user_${suffix}`,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedPending(
  container: TestContainer,
  opts: Readonly<{ ownerId: UserId; updatedAt: Date; kind?: MediaKind }>,
): Promise<{ id: MediaAssetId; storageKey: string }> {
  const id = nextMediaId();
  const kind: MediaKind = opts.kind ?? "source";
  const storageKey = `${opts.ownerId}/${kind}/${id}`;
  await container.db.insert(schema.mediaAssets).values({
    id: id as unknown as string,
    ownerId: opts.ownerId as unknown as string,
    kind,
    mimeType: kind === "source" ? "application/pdf" : "image/png",
    byteSize: 512,
    backend: "r2",
    storageKey,
    originalFileName: kind === "source" ? "doc.pdf" : null,
    width: null,
    height: null,
    durationMs: null,
    refCount: 0,
    status: "pending",
    createdAt: opts.updatedAt.toISOString(),
    updatedAt: opts.updatedAt.toISOString(),
  });
  return { id, storageKey };
}

function withFixedClock(c: TestContainer, at: Date): TestContainer {
  return { ...c, clock: { now: () => at } };
}

describe("sweepAbandonedSourceIntakes (integration)", () => {
  const getContainer = setupTestContainer();

  it("orphans a pending source older than the grace window and records media.orphaned in the outbox", async () => {
    const base = getContainer();
    const ownerId = await seedUser(base);
    const oldAt = new Date(SWEEP_TIME.getTime() - DAY_MS - 60_000);
    const { id } = await seedPending(base, { ownerId, updatedAt: oldAt });
    const container = withFixedClock(base, SWEEP_TIME);

    const result = await sweepAbandonedSourceIntakes(container);

    expect(result).toEqual({ swept: 1, failed: 0 });
    const rows = await base.db.select().from(schema.mediaAssets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("orphan");
    expect(rows[0]?.refCount).toBe(0);
    // Orphaning re-stamps updatedAt so the purge grace window starts now.
    expect(rows[0]?.updatedAt).toBe(SWEEP_TIME.toISOString());

    const events = await base.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, id as unknown as string));
    expect(events.map((e) => e.eventType)).toEqual(["media.orphaned"]);
  });

  it("skips a pending source still inside the grace window (24h − 1min pins the default grace boundary)", async () => {
    const base = getContainer();
    const ownerId = await seedUser(base);
    // Just inside the documented default (24h): paired with the swept
    // case at 24h + 1min, this pins DEFAULT_GRACE_SEC at its boundary —
    // an accidentally shrunken default (e.g. a typo'd 2h) fails here
    // instead of passing silently.
    const recentAt = new Date(SWEEP_TIME.getTime() - (DAY_MS - 60_000));
    await seedPending(base, { ownerId, updatedAt: recentAt });
    const container = withFixedClock(base, SWEEP_TIME);

    const result = await sweepAbandonedSourceIntakes(container);

    expect(result).toEqual({ swept: 0, failed: 0 });
    const rows = await base.db.select().from(schema.mediaAssets);
    expect(rows[0]?.status).toBe("pending");
  });

  it("does not touch old pending rows of other kinds (#468 ADR-004)", async () => {
    const base = getContainer();
    const ownerId = await seedUser(base);
    const oldAt = new Date(SWEEP_TIME.getTime() - DAY_MS - 60_000);
    await seedPending(base, { ownerId, updatedAt: oldAt, kind: "image" });
    const container = withFixedClock(base, SWEEP_TIME);

    const result = await sweepAbandonedSourceIntakes(container);

    expect(result).toEqual({ swept: 0, failed: 0 });
    const rows = await base.db.select().from(schema.mediaAssets);
    expect(rows[0]?.status).toBe("pending");
  });

  it("is idempotent at the query level: a second sweep finds no candidates", async () => {
    // Once orphaned, a row no longer matches the candidate query
    // (`status = 'pending'`), so re-running the sweep is a no-op at the
    // listing level — the per-row fresh guard is never exercised on this
    // path (it is covered by the unit test's mutation injection).
    const base = getContainer();
    const ownerId = await seedUser(base);
    const oldAt = new Date(SWEEP_TIME.getTime() - DAY_MS - 60_000);
    const { id } = await seedPending(base, { ownerId, updatedAt: oldAt });
    const container = withFixedClock(base, SWEEP_TIME);

    const first = await sweepAbandonedSourceIntakes(container);
    expect(first).toEqual({ swept: 1, failed: 0 });

    const second = await sweepAbandonedSourceIntakes(container);
    expect(second).toEqual({ swept: 0, failed: 0 });

    const events = await base.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, id as unknown as string));
    expect(events.map((e) => e.eventType)).toEqual(["media.orphaned"]);
  });

  it("hands off to purgeOrphans: the orphaned intake's blob and row are reclaimed", async () => {
    const base = getContainer();
    const ownerId = await seedUser(base);
    const oldAt = new Date(SWEEP_TIME.getTime() - DAY_MS - 60_000);
    const { storageKey } = await seedPending(base, {
      ownerId,
      updatedAt: oldAt,
    });
    await base.objectStorage.put(
      storageKey,
      new ArrayBuffer(4),
      "application/pdf",
    );

    const sweepResult = await sweepAbandonedSourceIntakes(
      withFixedClock(base, SWEEP_TIME),
    );
    expect(sweepResult).toEqual({ swept: 1, failed: 0 });

    // The orphan's updatedAt is SWEEP_TIME and the purge candidate
    // filter is a strict `<`, so advance the clock before purging even
    // with ageSec 0.
    const purgeTime = new Date(SWEEP_TIME.getTime() + 60_000);
    const purgeResult = await purgeOrphans(withFixedClock(base, purgeTime), {
      orphanAgeSec: 0,
    });
    expect(purgeResult).toEqual({ purged: 1, failed: 0 });

    const rows = await base.db.select().from(schema.mediaAssets);
    expect(rows).toHaveLength(0);
    await expect(base.objectStorage.stat(storageKey)).rejects.toThrow();
  });

  it("reclaims a blobless pending row (put failed): purge completes via delete idempotency", async () => {
    // Metadata-first means a failed `put` leaves a pending row with no
    // backing blob. The `ObjectStorage.delete` contract (missing key =
    // success, #468 ADR-002) lets the purge run to completion instead of
    // stalling the row in `deleting`.
    const base = getContainer();
    const ownerId = await seedUser(base);
    const oldAt = new Date(SWEEP_TIME.getTime() - DAY_MS - 60_000);
    await seedPending(base, { ownerId, updatedAt: oldAt });

    const sweepResult = await sweepAbandonedSourceIntakes(
      withFixedClock(base, SWEEP_TIME),
    );
    expect(sweepResult).toEqual({ swept: 1, failed: 0 });

    const purgeTime = new Date(SWEEP_TIME.getTime() + 60_000);
    const purgeResult = await purgeOrphans(withFixedClock(base, purgeTime), {
      orphanAgeSec: 0,
    });
    expect(purgeResult).toEqual({ purged: 1, failed: 0 });

    const rows = await base.db.select().from(schema.mediaAssets);
    expect(rows).toHaveLength(0);
  });
});
