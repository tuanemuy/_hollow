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
