import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { UserId } from "@/core/domain/identity/valueObject";
import {
  type ObjectStorage,
  StorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import type { MediaAssetId, MediaKind } from "@/core/domain/media/valueObject";
import { purgeOrphans } from "../purgeOrphans";

// spec: spec/testcases/media/index.md#PurgeOrphans
//
// `purgeOrphans` is timestamp-driven (24h orphan grace window by default)
// and storage-coupled (R2 delete must succeed for the DB delete to run).
// These tests use a fixed `container.clock` and a ThrowingObjectStorage
// stub to drive the two branches deterministically. The sweep is the only
// service that walks orphan rows on a wall-clock basis, so the small
// helper file keeps the clock-override boilerplate out of the main
// `media.integration.test.ts` file.

const SWEEP_TIME = new Date("2026-04-15T12:00:00.000Z");
const TZ = SWEEP_TIME.toISOString();

let userSeq = 0;
let mediaSeq = 0;

function nextUserId(): UserId {
  userSeq += 1;
  return `019d4000-0000-7000-8000-${userSeq.toString(16).padStart(12, "0")}` as UserId;
}

function nextMediaId(): MediaAssetId {
  mediaSeq += 1;
  return `019d5000-0000-7000-8000-${mediaSeq.toString(16).padStart(12, "0")}` as MediaAssetId;
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

type OrphanSeedOptions = Readonly<{
  ownerId: UserId;
  updatedAt: Date;
  kind?: MediaKind;
}>;

async function seedOrphan(
  container: TestContainer,
  opts: OrphanSeedOptions,
): Promise<MediaAssetId> {
  const id = nextMediaId();
  const kind: MediaKind = opts.kind ?? "image";
  await container.db.insert(schema.mediaAssets).values({
    id: id as unknown as string,
    ownerId: opts.ownerId as unknown as string,
    kind,
    mimeType: "image/png",
    byteSize: 512,
    backend: "r2",
    storageKey: `${opts.ownerId}/${kind}/${id}`,
    originalFileName: null,
    width: null,
    height: null,
    durationMs: null,
    refCount: 0,
    status: "orphan",
    createdAt: opts.updatedAt.toISOString(),
    updatedAt: opts.updatedAt.toISOString(),
  });
  return id;
}

/**
 * Returns a `TestContainer` whose `clock.now()` is pinned to `at`. Only
 * usecase-direct reads of `container.clock` are affected — the
 * `D1UnitOfWorkProvider`'s internal `SystemClock` (outbox row timestamps
 * etc.) is intentionally NOT swapped, per ADR-001 / plan section 5.
 */
function withFixedClock(c: TestContainer, at: Date): TestContainer {
  return { ...c, clock: { now: () => at } };
}

/**
 * Test-local `ObjectStorage` whose `delete` always raises
 * `StorageUnavailableError`. Used to drive the "R2 delete failed →
 * counted as failed, retried next tick" path. Other methods delegate to
 * the wrapped in-memory storage so unrelated code paths still work.
 */
class ThrowingObjectStorage implements ObjectStorage {
  constructor(private readonly inner: ObjectStorage) {}
  put(key: string, bytes: ArrayBuffer, contentType: string) {
    return this.inner.put(key, bytes, contentType);
  }
  get(key: string) {
    return this.inner.get(key);
  }
  stat(key: string) {
    return this.inner.stat(key);
  }
  async delete(): Promise<void> {
    throw new StorageUnavailableError("simulated R2 delete failure");
  }
  presignDownload(key: string, ttlSec: number) {
    return this.inner.presignDownload(key, ttlSec);
  }
  presignUpload(key: string, contentType: string, ttlSec: number) {
    return this.inner.presignUpload(key, contentType, ttlSec);
  }
}

describe("purgeOrphans (integration)", () => {
  // spec: spec/testcases/media/index.md#PurgeOrphans
  const getContainer = setupTestContainer();

  it("transitions orphans older than 24h to deleting and finalises the purge (R2 delete + DB delete)", async () => {
    const base = getContainer();
    const ownerId = await seedUser(base);
    const oldAt = new Date(SWEEP_TIME.getTime() - (24 * 60 * 60 + 60) * 1000);
    const orphanId = await seedOrphan(base, { ownerId, updatedAt: oldAt });
    const container = withFixedClock(base, SWEEP_TIME);

    const result = await purgeOrphans(container);

    expect(result.purged).toBe(1);
    expect(result.failed).toBe(0);
    const rows = await base.db.select().from(schema.mediaAssets);
    expect(rows).toHaveLength(0);
    void orphanId;
  });

  it("skips orphans whose grace window has not lapsed yet", async () => {
    const base = getContainer();
    const ownerId = await seedUser(base);
    const recentAt = new Date(SWEEP_TIME.getTime() - 60 * 60 * 1000); // 1 hour ago
    const orphanId = await seedOrphan(base, { ownerId, updatedAt: recentAt });
    const container = withFixedClock(base, SWEEP_TIME);

    const result = await purgeOrphans(container);

    expect(result.purged).toBe(0);
    expect(result.failed).toBe(0);
    const rows = await base.db.select().from(schema.mediaAssets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(orphanId as unknown as string);
    expect(rows[0]?.status).toBe("orphan");
  });

  it("counts R2 delete failures as failed and leaves the asset in `deleting` for the next sweep to retry", async () => {
    const base = getContainer();
    const ownerId = await seedUser(base);
    const oldAt = new Date(SWEEP_TIME.getTime() - (24 * 60 * 60 + 60) * 1000);
    const orphanId = await seedOrphan(base, { ownerId, updatedAt: oldAt });
    const container = withFixedClock(
      { ...base, objectStorage: new ThrowingObjectStorage(base.objectStorage) },
      SWEEP_TIME,
    );

    const result = await purgeOrphans(container);

    expect(result.purged).toBe(0);
    expect(result.failed).toBe(1);
    const rows = await base.db.select().from(schema.mediaAssets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(orphanId as unknown as string);
    // The first UoW transitioned `orphan → deleting` and committed before
    // the failing `storage.delete`; the asset row therefore remains in
    // `deleting` for an operator to inspect (the next orphan sweep does
    // not pick it back up because it filters on `status === 'orphan'`).
    expect(rows[0]?.status).toBe("deleting");
  });
});
