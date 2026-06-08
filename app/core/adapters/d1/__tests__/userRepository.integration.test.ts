import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1UserRepository.searchPublicByUsernamePrefix`
 * (Issue #568, P32 public search drawer). Verifies the SQL gates on
 * username prefix, live status (`deleted_at IS NULL AND banned = 0`) and
 * the "owns ≥ 1 public note" EXISTS enumeration guard.
 */

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7f5-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(
  container: TestContainer,
  username: string,
  opts: { banned?: 0 | 1; deleted?: boolean; emailVerified?: 0 | 1 } = {},
): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: `Display ${username}`,
    email: `${id}@example.com`,
    emailVerified: opts.emailVerified ?? 1,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username,
    displayUsername: null,
    role: "member",
    banned: opts.banned ?? 0,
    banReason: null,
    banExpires: null,
    bio: null,
    avatarMediaId: null,
    deletedAt: opts.deleted ? TZ : null,
  });
  return id as UserId;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
): Promise<string> {
  const id = nextId(0x02);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: null,
    name: "root",
    slug: `dir-${id.slice(9, 13)}`,
    depth: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedPublicNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: string,
  visibility: "private" | "unlisted" | "public",
): Promise<void> {
  const noteId = nextId(0x03);
  await container.db.insert(schema.notes).values({
    id: noteId,
    ownerId,
    directoryId,
    slug: `note-${noteId.slice(9, 13)}`,
    title: "seeded",
    contentHtml: "<p>body</p>",
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility,
    publishedAt: visibility === "public" ? TZ : null,
    updatedAt: TZ,
    version: 0,
  });
}

describe("D1UserRepository.searchPublicByUsernamePrefix (integration, #568)", () => {
  it("returns live users with a public note, prefix + case-insensitive query, ordered by username", async () => {
    const container = createTestContainer();
    // Usernames are lowercase by the domain rule; the prefix *query* may be
    // any case and still match (`LOWER(username) LIKE lower(prefix)%`).
    const tuanemuy = await seedUser(container, "tuanemuy");
    const tomo = await seedUser(container, "tomo");
    await seedUser(container, "kwakita"); // does not match prefix

    const dirA = await seedDirectory(container, tuanemuy);
    const dirB = await seedDirectory(container, tomo);
    await seedPublicNote(container, tuanemuy, dirA, "public");
    await seedPublicNote(container, tomo, dirB, "public");

    const rows = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("T", 10),
    );
    expect(rows.map((u) => u.username)).toEqual(["tomo", "tuanemuy"]);
    expect(rows.map((u) => u.displayName)).toEqual([
      "Display tomo",
      "Display tuanemuy",
    ]);
  });

  it("excludes users without any public note (private / unlisted / none)", async () => {
    const container = createTestContainer();
    const priv = await seedUser(container, "priv-user");
    const unl = await seedUser(container, "priv-unl");
    await seedUser(container, "priv-none");

    const dirP = await seedDirectory(container, priv);
    const dirU = await seedDirectory(container, unl);
    await seedPublicNote(container, priv, dirP, "private");
    await seedPublicNote(container, unl, dirU, "unlisted");

    const rows = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("priv", 10),
    );
    expect(rows).toEqual([]);
  });

  it("excludes deleted and suspended (banned) authors even with a public note", async () => {
    const container = createTestContainer();
    const deleted = await seedUser(container, "gone-user", { deleted: true });
    const banned = await seedUser(container, "gone-banned", { banned: 1 });
    const live = await seedUser(container, "gone-live");

    for (const owner of [deleted, banned, live]) {
      const dir = await seedDirectory(container, owner);
      await seedPublicNote(container, owner, dir, "public");
    }

    const rows = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("gone", 10),
    );
    expect(rows.map((u) => u.username)).toEqual(["gone-live"]);
  });

  it("returns [] for empty prefix and non-positive limit", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container, "edge-user");
    const dir = await seedDirectory(container, owner);
    await seedPublicNote(container, owner, dir, "public");

    const empty = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("  ", 10),
    );
    expect(empty).toEqual([]);

    const zero = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("edge", 0),
    );
    expect(zero).toEqual([]);
  });
});
