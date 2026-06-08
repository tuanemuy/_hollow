import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { listUserPublicNotes } from "../listUserPublicNotes";

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7e2-${block}-7000-8000-0000000000${tail}`;
};

const iso = (s: string): string => new Date(s).toISOString();

async function seedUser(
  container: TestContainer,
  username: string,
): Promise<UserId> {
  const id = nextId(0x0a);
  await container.db.insert(schema.users).values({
    id,
    name: "T",
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: iso("2024-01-01T00:00:00.000Z"),
    updatedAt: iso("2024-01-01T00:00:00.000Z"),
    username,
    role: "member",
    banned: 0,
  });
  return id as UserId;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
): Promise<DirectoryId> {
  const id = nextId(0x0b);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: null,
    name: "root",
    slug: `d-${id.slice(9, 13)}`,
    depth: 0,
    version: 0,
    createdAt: iso("2024-01-01T00:00:00.000Z"),
    updatedAt: iso("2024-01-01T00:00:00.000Z"),
  });
  return id as DirectoryId;
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: { title: string; updatedAt: string; status?: "active" | "trashed" },
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: opts.title,
    contentHtml: `<p>${opts.title}</p>`,
    frontMatterJson: "{}",
    status: opts.status ?? "active",
    trashedAt: null,
    sourceFileId: null,
    createdAt: iso("2024-01-01T00:00:00.000Z"),
    updatedAt: iso(opts.updatedAt),
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id as NoteId;
}

async function seedPublic(
  container: TestContainer,
  noteId: NoteId,
  ownerId: UserId,
  visibility: "public" | "private" | "unlisted" = "public",
): Promise<void> {
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility,
    publishedAt:
      visibility === "public" ? iso("2024-02-01T00:00:00.000Z") : null,
    updatedAt: iso("2024-02-01T00:00:00.000Z"),
    version: 0,
  });
}

async function seedTag(
  container: TestContainer,
  ownerId: UserId,
  name: string,
): Promise<string> {
  const id = nextId(0x0e);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name.toLowerCase(),
    version: 0,
    createdAt: iso("2024-01-01T00:00:00.000Z"),
    updatedAt: iso("2024-01-01T00:00:00.000Z"),
  });
  return id;
}

async function tagNote(
  container: TestContainer,
  noteId: NoteId,
  tagId: string,
): Promise<void> {
  await container.db.insert(schema.noteTags).values({
    noteId,
    tagId,
  });
}

describe("listUserPublicNotes (integration)", () => {
  const getContainer = setupTestContainer();

  it("returns only public, active notes ordered by updatedAt desc with an accurate total", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-a");
    const dir = await seedDirectory(container, owner);

    const older = await seedNote(container, owner, dir, {
      title: "older",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = await seedNote(container, owner, dir, {
      title: "newer",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await seedPublic(container, older, owner);
    await seedPublic(container, newer, owner);

    // A private and a trashed note must be excluded.
    const priv = await seedNote(container, owner, dir, {
      title: "private",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    await seedPublic(container, priv, owner, "private");
    const trashed = await seedNote(container, owner, dir, {
      title: "trashed",
      updatedAt: "2026-02-15T00:00:00.000Z",
      status: "trashed",
    });
    await seedPublic(container, trashed, owner);

    const result = await listUserPublicNotes({
      container,
      input: { username: "owner-a", page: 1, limit: 20 },
    });

    expect(result.total).toBe(2);
    expect(result.notes.map((n) => n.title)).toEqual(["newer", "older"]);
    expect(result.notes.every((n) => n.visibility === "public")).toBe(true);
    // items.length <= total holds structurally.
    expect(result.notes.length).toBeLessThanOrEqual(result.total);
  });

  it("keeps the filtered total independent of the page window", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-b");
    const dir = await seedDirectory(container, owner);

    for (let i = 0; i < 3; i++) {
      const note = await seedNote(container, owner, dir, {
        title: `note-${i}`,
        updatedAt: `2026-0${i + 1}-01T00:00:00.000Z`,
      });
      await seedPublic(container, note, owner);
    }

    const page1 = await listUserPublicNotes({
      container,
      input: { username: "owner-b", page: 1, limit: 2 },
    });
    expect(page1.total).toBe(3);
    expect(page1.notes.length).toBe(2);

    const page2 = await listUserPublicNotes({
      container,
      input: { username: "owner-b", page: 2, limit: 2 },
    });
    expect(page2.total).toBe(3);
    expect(page2.notes.length).toBe(1);
  });

  it("filters to notes carrying every supplied tag (AND semantics)", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-c");
    const dir = await seedDirectory(container, owner);

    const cloudflare = await seedTag(container, owner, "cloudflare");
    const design = await seedTag(container, owner, "design");

    const both = await seedNote(container, owner, dir, {
      title: "both",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await seedPublic(container, both, owner);
    await tagNote(container, both, cloudflare);
    await tagNote(container, both, design);

    const onlyOne = await seedNote(container, owner, dir, {
      title: "only-cloudflare",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    await seedPublic(container, onlyOne, owner);
    await tagNote(container, onlyOne, cloudflare);

    const single = await listUserPublicNotes({
      container,
      input: {
        username: "owner-c",
        page: 1,
        limit: 20,
        tagNames: ["cloudflare"],
      },
    });
    expect(single.total).toBe(2);
    expect(single.notes.map((n) => n.title).sort()).toEqual([
      "both",
      "only-cloudflare",
    ]);

    const intersection = await listUserPublicNotes({
      container,
      input: {
        username: "owner-c",
        page: 1,
        limit: 20,
        tagNames: ["cloudflare", "design"],
      },
    });
    expect(intersection.total).toBe(1);
    expect(intersection.notes.map((n) => n.title)).toEqual(["both"]);
  });

  it("returns an empty page when a requested tag name does not exist for the owner", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-d");
    const dir = await seedDirectory(container, owner);
    const note = await seedNote(container, owner, dir, {
      title: "n",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await seedPublic(container, note, owner);

    const result = await listUserPublicNotes({
      container,
      input: {
        username: "owner-d",
        page: 1,
        limit: 20,
        tagNames: ["nonexistent"],
      },
    });
    expect(result.total).toBe(0);
    expect(result.notes).toEqual([]);
  });

  it("honours the sort axis (title asc)", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-e");
    const dir = await seedDirectory(container, owner);

    for (const title of ["banana", "apple", "cherry"]) {
      const note = await seedNote(container, owner, dir, {
        title,
        updatedAt: "2026-03-01T00:00:00.000Z",
      });
      await seedPublic(container, note, owner);
    }

    const result = await listUserPublicNotes({
      container,
      input: {
        username: "owner-e",
        page: 1,
        limit: 20,
        sort: "title",
        order: "asc",
      },
    });
    expect(result.notes.map((n) => n.title)).toEqual([
      "apple",
      "banana",
      "cherry",
    ]);
  });
});
