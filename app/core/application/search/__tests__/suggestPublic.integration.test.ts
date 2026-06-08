import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { UserId } from "@/core/domain/identity/valueObject";
import { suggestPublicTags } from "../suggestPublicTags";
import { suggestPublicUsers } from "../suggestPublicUsers";

/**
 * Integration tests (real SQLite) for the P32 public suggestion usecases.
 * In-memory fakes cannot reproduce the public-note JOIN/EXISTS gate, so the
 * "only live authors / only public-linked tags surface" behaviour is
 * verified end-to-end here per `docs/test.md`.
 */

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7fa-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(
  container: TestContainer,
  username: string,
  opts: { banned?: 0 | 1; deleted?: boolean } = {},
): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: `Display ${username}`,
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: TZ,
    updatedAt: TZ,
    username,
    role: "member",
    banned: opts.banned ?? 0,
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

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: string,
  visibility: "private" | "unlisted" | "public",
  tagNames: readonly string[] = [],
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
  for (const name of tagNames) {
    const tagId = nextId(0x04);
    await container.db.insert(schema.tags).values({
      id: tagId,
      ownerId,
      name,
      nameNormalized: name.toLowerCase(),
      version: 0,
      createdAt: TZ,
      updatedAt: TZ,
    });
    await container.db.insert(schema.noteTags).values({ noteId, tagId });
  }
}

describe("suggestPublicTags (integration)", () => {
  const getContainer = setupTestContainer();

  it("suggests only tags linked to a public note", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "author-a");
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, "public", ["cloudflare"]);
    await seedNote(container, owner, dir, "private", ["clandestine"]);

    const { suggestions } = await suggestPublicTags({
      container,
      input: { prefix: "cl" },
    });
    expect(suggestions.map((s) => s.name)).toEqual(["cloudflare"]);
  });

  it("returns no suggestions for an empty prefix", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "author-b");
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, "public", ["anything"]);

    const { suggestions } = await suggestPublicTags({
      container,
      input: { prefix: "   " },
    });
    expect(suggestions).toEqual([]);
  });
});

describe("suggestPublicUsers (integration)", () => {
  const getContainer = setupTestContainer();

  it("suggests only live authors with a public note", async () => {
    const container = getContainer();
    const live = await seedUser(container, "tuanemuy");
    const banned = await seedUser(container, "tubanned", { banned: 1 });
    const privateOnly = await seedUser(container, "tuprivate");

    const dirLive = await seedDirectory(container, live);
    const dirBan = await seedDirectory(container, banned);
    const dirPriv = await seedDirectory(container, privateOnly);
    await seedNote(container, live, dirLive, "public");
    await seedNote(container, banned, dirBan, "public");
    await seedNote(container, privateOnly, dirPriv, "private");

    const { suggestions } = await suggestPublicUsers({
      container,
      input: { prefix: "tu" },
    });
    expect(suggestions.map((s) => s.username)).toEqual(["tuanemuy"]);
    expect(suggestions[0]?.displayName).toBe("Display tuanemuy");
  });

  it("returns no suggestions for an empty prefix", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "someone");
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, "public");

    const { suggestions } = await suggestPublicUsers({
      container,
      input: { prefix: "" },
    });
    expect(suggestions).toEqual([]);
  });
});
