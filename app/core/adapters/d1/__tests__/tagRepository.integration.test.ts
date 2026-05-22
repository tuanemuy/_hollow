import type { BatchItem } from "drizzle-orm/batch";
import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1TagRepository.searchByNamePrefix` (Issue #36)
 * plus a regression for the `findByOwner` LIKE-ESCAPE change (ADR-006:
 * raw `sql\`... LIKE ${pat} ESCAPE '\\'\`` so `escapeLikePattern` works).
 */

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7f0-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Tag Test",
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username: `t-${id.slice(9, 13)}`,
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

async function seedTagRow(
  container: TestContainer,
  ownerId: UserId,
  name: string,
): Promise<string> {
  const id = nextId(0x02);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name.toLowerCase(),
    noteCount: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

describe("D1TagRepository.searchByNamePrefix (integration)", () => {
  it("returns matching tags, case-insensitively, ordered by name", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "Draft");
    await seedTagRow(container, owner, "drama");
    await seedTagRow(container, owner, "idea");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "DR", 10),
    );
    expect(rows.map((t) => t.name)).toEqual(["Draft", "drama"]);
  });

  it("isolates owners", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    await seedTagRow(container, owner, "alpha-mine");
    await seedTagRow(container, stranger, "alpha-theirs");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "alpha", 10),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("alpha-mine");
    expect(rows[0].ownerId).toBe(owner);
  });

  it("escapes LIKE wildcards `%` and `_` so they match literally", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "50%-tag");
    await seedTagRow(container, owner, "50abc-tag");
    await seedTagRow(container, owner, "foo_bar");
    await seedTagRow(container, owner, "fooxbar");

    const pct = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "50%", 10),
    );
    expect(pct.map((t) => t.name)).toEqual(["50%-tag"]);

    const underscore = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "foo_", 10),
    );
    expect(underscore.map((t) => t.name)).toEqual(["foo_bar"]);
  });

  it("returns [] when limit <= 0", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "anything");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "any", 0),
    );
    expect(rows).toEqual([]);
  });

  it("returns [] for an empty / whitespace-only prefix", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "anything");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "  ", 10),
    );
    expect(rows).toEqual([]);
  });
});

describe("D1TagRepository.findByOwner — LIKE ESCAPE regression (Issue #36)", () => {
  it("treats `%` and `_` in the search query as literal characters", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "50%-special");
    await seedTagRow(container, owner, "50abc-noise");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, {
          limit: 10,
          offset: 0,
          query: "50%",
        }),
    );
    expect(rows.map((t) => t.name)).toEqual(["50%-special"]);
  });
});

describe("D1TagRepository.findByIds — D1 bind limit regression (Issue #45)", () => {
  // 150 tag ids feed `inArray(tags.id, [...])` past the D1 host-variable
  // cap on the pre-#45 implementation. Post-fix `selectInChunks`
  // splits the lookup and concatenates rows across chunks.
  it("T-bind-001: findByIds returns all 150 rows across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);

    const tagIds: TagId[] = [];
    const tagStmts: BatchItem<"sqlite">[] = [];
    for (let i = 0; i < 150; i += 1) {
      const id = nextId(0x03);
      tagIds.push(id as TagId);
      tagStmts.push(
        container.db.insert(schema.tags).values({
          id,
          ownerId: owner,
          name: `bulk-${i}`,
          nameNormalized: `bulk-${i}`,
          noteCount: 0,
          version: 0,
          createdAt: TZ,
          updatedAt: TZ,
        }),
      );
    }
    await container.db.batch(
      tagStmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) => tagRepository.findByIds(tagIds),
    );
    expect(rows).toHaveLength(150);
    expect(new Set(rows.map((t) => t.id))).toEqual(new Set(tagIds));
  });

  it("returns [] for an empty id list without querying", async () => {
    const container = createTestContainer();
    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) => tagRepository.findByIds([]),
    );
    expect(rows).toEqual([]);
  });
});
