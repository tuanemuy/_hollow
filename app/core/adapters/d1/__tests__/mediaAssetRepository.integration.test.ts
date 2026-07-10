import type { BatchItem } from "drizzle-orm/batch";
import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7f1-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Media Test",
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username: `m-${id.slice(9, 13)}`,
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

describe("D1MediaAssetRepository.findByIds — D1 bind limit regression (Issue #45)", () => {
  // 150 media-asset ids feed `inArray(mediaAssets.id, [...])` past the
  // D1 host-variable cap on the pre-#45 implementation. Post-fix
  // `selectInChunks` splits the lookup and concatenates rows across
  // chunks.
  it("T-bind-001: findByIds returns all 150 rows across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);

    const ids: MediaAssetId[] = [];
    const stmts: BatchItem<"sqlite">[] = [];
    for (let i = 0; i < 150; i += 1) {
      const id = nextId(0x02);
      ids.push(id as MediaAssetId);
      stmts.push(
        container.db.insert(schema.mediaAssets).values({
          id,
          ownerId: owner,
          kind: "image",
          mimeType: "image/png",
          byteSize: 1,
          backend: "r2",
          storageKey: `bulk/${id}`,
          originalFileName: `${i}.png`,
          width: null,
          height: null,
          durationMs: null,
          refCount: 0,
          status: "pending",
          createdAt: TZ,
          updatedAt: TZ,
        }),
      );
    }
    await container.db.batch(
      stmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const rows = await container.unitOfWorkProvider.run(
      async ({ mediaAssetRepository }) => mediaAssetRepository.findByIds(ids),
    );
    expect(rows).toHaveLength(150);
    expect(new Set(rows.map((m) => m.id))).toEqual(new Set(ids));
  });

  it("returns [] for an empty id list without querying", async () => {
    const container = createTestContainer();
    const rows = await container.unitOfWorkProvider.run(
      async ({ mediaAssetRepository }) => mediaAssetRepository.findByIds([]),
    );
    expect(rows).toEqual([]);
  });
});

describe("D1MediaAssetRepository.findAbandonedSourceIntakes (integration, #468)", () => {
  const CUTOFF = new Date("2026-03-02T00:00:00.000Z");
  const OLD = new Date(CUTOFF.getTime() - 60_000).toISOString();
  const RECENT = new Date(CUTOFF.getTime() + 60_000).toISOString();

  async function insertMedia(
    container: TestContainer,
    ownerId: UserId,
    opts: {
      kind: string;
      status: string;
      refCount?: number;
      updatedAt: string;
    },
  ): Promise<string> {
    const id = nextId(0x07);
    await container.db.insert(schema.mediaAssets).values({
      id,
      ownerId,
      kind: opts.kind,
      mimeType: opts.kind === "source" ? "application/pdf" : "image/png",
      byteSize: 1,
      backend: "r2",
      storageKey: `${ownerId}/${opts.kind}/${id}`,
      originalFileName: null,
      width: null,
      height: null,
      durationMs: null,
      refCount: opts.refCount ?? 0,
      status: opts.status,
      createdAt: TZ,
      updatedAt: opts.updatedAt,
    });
    return id;
  }

  it("returns only pending/source rows older than the cutoff, oldest first", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);

    const older = await insertMedia(container, owner, {
      kind: "source",
      status: "pending",
      updatedAt: new Date(CUTOFF.getTime() - 120_000).toISOString(),
    });
    const old = await insertMedia(container, owner, {
      kind: "source",
      status: "pending",
      updatedAt: OLD,
    });
    // Excluded: fresh pending/source (grace window not lapsed).
    await insertMedia(container, owner, {
      kind: "source",
      status: "pending",
      updatedAt: RECENT,
    });
    // Excluded: pending of another kind, however old (#468 ADR-004).
    await insertMedia(container, owner, {
      kind: "image",
      status: "pending",
      updatedAt: OLD,
    });
    // Excluded: non-pending sources.
    await insertMedia(container, owner, {
      kind: "source",
      status: "attached",
      refCount: 1,
      updatedAt: OLD,
    });
    await insertMedia(container, owner, {
      kind: "source",
      status: "orphan",
      updatedAt: OLD,
    });

    const rows = await container.unitOfWorkProvider.run(
      async ({ mediaAssetRepository }) =>
        mediaAssetRepository.findAbandonedSourceIntakes(CUTOFF, 10),
    );
    expect(rows.map((r) => r.id)).toEqual([older, old]);
    for (const row of rows) {
      expect(row.status).toBe("pending");
      expect(row.kind).toBe("source");
    }
  });

  it("respects the limit", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    for (let i = 0; i < 3; i += 1) {
      await insertMedia(container, owner, {
        kind: "source",
        status: "pending",
        updatedAt: OLD,
      });
    }

    const rows = await container.unitOfWorkProvider.run(
      async ({ mediaAssetRepository }) =>
        mediaAssetRepository.findAbandonedSourceIntakes(CUTOFF, 2),
    );
    expect(rows).toHaveLength(2);
  });

  it("excludes rows whose updatedAt equals the cutoff (strict <)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await insertMedia(container, owner, {
      kind: "source",
      status: "pending",
      updatedAt: CUTOFF.toISOString(),
    });

    const rows = await container.unitOfWorkProvider.run(
      async ({ mediaAssetRepository }) =>
        mediaAssetRepository.findAbandonedSourceIntakes(CUTOFF, 10),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("D1MediaAssetRepository.aggregateByOwner (integration, #573)", () => {
  async function insertMedia(
    container: TestContainer,
    ownerId: UserId,
    opts: { byteSize: number; status: string },
  ): Promise<void> {
    const id = nextId(0x05);
    await container.db.insert(schema.mediaAssets).values({
      id,
      ownerId,
      kind: "image",
      mimeType: "image/png",
      byteSize: opts.byteSize,
      backend: "r2",
      storageKey: `agg/${id}`,
      originalFileName: "f.png",
      width: null,
      height: null,
      durationMs: null,
      refCount: 0,
      status: opts.status,
      createdAt: TZ,
      updatedAt: TZ,
    });
  }

  it("sums byteSize and counts only attached assets, excluding other owners", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const other = await seedUser(container);

    await insertMedia(container, owner, { byteSize: 100, status: "attached" });
    await insertMedia(container, owner, { byteSize: 250, status: "attached" });
    // Excluded: non-attached transients.
    await insertMedia(container, owner, { byteSize: 999, status: "pending" });
    await insertMedia(container, owner, { byteSize: 999, status: "orphan" });
    await insertMedia(container, owner, { byteSize: 999, status: "deleting" });
    // Excluded: another owner's attached asset.
    await insertMedia(container, other, { byteSize: 500, status: "attached" });

    const result = await container.unitOfWorkProvider.run(
      async ({ mediaAssetRepository }) =>
        mediaAssetRepository.aggregateByOwner(owner),
    );
    expect(result).toEqual({ count: 2, totalBytes: 350 });
  });

  it("returns { count: 0, totalBytes: 0 } when the owner has no attached media", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await insertMedia(container, owner, { byteSize: 42, status: "pending" });

    const result = await container.unitOfWorkProvider.run(
      async ({ mediaAssetRepository }) =>
        mediaAssetRepository.aggregateByOwner(owner),
    );
    expect(result).toEqual({ count: 0, totalBytes: 0 });
  });
});
