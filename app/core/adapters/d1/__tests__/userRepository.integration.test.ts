import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1UserRepository.searchPublicByUsernamePrefix`.
 * Verifies the SQL gates on username prefix, live status
 * (`deleted_at IS NULL AND banned = 0`) and the "owns ≥ 1 public note"
 * EXISTS enumeration guard.
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
  status: "active" | "trashed" = "active",
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
    status,
    trashedAt: status === "trashed" ? TZ : null,
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

  it("excludes authors whose only public publication_state points at a trashed note (B-001)", async () => {
    const container = createTestContainer();
    // `trash-only` keeps a `visibility='public'` row but the note is
    // trashed — the EXISTS active JOIN must drop it. `trash-live` also has
    // a separate live public note so it stays visible (proves the JOIN
    // gates on the note status, not on the author).
    const trashOnly = await seedUser(container, "trash-only");
    const trashLive = await seedUser(container, "trash-live");

    const dirT = await seedDirectory(container, trashOnly);
    await seedPublicNote(container, trashOnly, dirT, "public", "trashed");

    const dirL = await seedDirectory(container, trashLive);
    await seedPublicNote(container, trashLive, dirL, "public", "trashed");
    await seedPublicNote(container, trashLive, dirL, "public", "active");

    const rows = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("trash", 10),
    );
    expect(rows.map((u) => u.username)).toEqual(["trash-live"]);
  });

  it("treats LIKE wildcards in the prefix query literally (% and _ are not wildcards)", async () => {
    const container = createTestContainer();
    // The prefix search is a half-open range scan (`username >= q AND
    // username < upper(q)`), not a `LIKE`, so `%` / `_` carry no special
    // meaning — they are ordinary characters in the bound. Usernames are
    // constrained to [a-z0-9-] by the domain, so a query holding `%` / `_`
    // bounds a range no real username falls into and matches nothing.
    const a = await seedUser(container, "ab-1");
    const b = await seedUser(container, "axb");

    for (const owner of [a, b]) {
      const dir = await seedDirectory(container, owner);
      await seedPublicNote(container, owner, dir, "public");
    }

    // `%` (0x25) sorts below `b`/`x`, so the range `[a%, a&)` excludes both
    // real usernames — a wildcard `LIKE` would instead have pulled them in.
    const percentRows = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("a%", 10),
    );
    expect(percentRows).toEqual([]);

    // `_` (0x5f) likewise bounds a range no username starts with.
    const underscoreRows = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("a_", 10),
    );
    expect(underscoreRows).toEqual([]);

    // Sanity: the literal prefix `a` still matches both rows, proving the
    // empty results above are the range semantics, not a broken query.
    const plainRows = await container.unitOfWorkProvider.run(
      async ({ userRepository }) =>
        userRepository.searchPublicByUsernamePrefix("a", 10),
    );
    expect(plainRows.map((u) => u.username)).toEqual(["ab-1", "axb"]);
  });

  it("folds the prefix query to lowercase before the range scan", async () => {
    const container = createTestContainer();
    // Usernames are lowercase by the domain rule; the prefix *query* may be
    // any case. The adapter lowercases the query before bounding the range,
    // so `F`/`FOO` match the stored lowercase `foo`. (A mixed-case stored
    // username cannot be rehydrated — the domain `Username` invariant
    // rejects it — so only the query side needs case folding; no separate
    // normalised column is required.)
    const foo = await seedUser(container, "foo");
    const dir = await seedDirectory(container, foo);
    await seedPublicNote(container, foo, dir, "public");

    for (const q of ["F", "f", "FOO", "foo"]) {
      const rows = await container.unitOfWorkProvider.run(
        async ({ userRepository }) =>
          userRepository.searchPublicByUsernamePrefix(q, 10),
      );
      expect(rows.map((u) => u.username)).toEqual(["foo"]);
    }
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
