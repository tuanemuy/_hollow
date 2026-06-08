import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { listRelatedPublicNotes } from "../listRelatedPublicNotes";

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7e3-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x0a);
  await container.db.insert(schema.users).values({
    id,
    name: "T",
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: TZ,
    updatedAt: TZ,
    username: `u-${id.slice(9, 13)}`,
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
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id as DirectoryId;
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: { status?: "active" | "trashed" } = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: `note ${id.slice(9, 13)}`,
    contentHtml: "<p>body</p>",
    frontMatterJson: "{}",
    status: opts.status ?? "active",
    trashedAt: opts.status === "trashed" ? TZ : null,
    sourceFileId: null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id as NoteId;
}

async function seedPublication(
  container: TestContainer,
  noteId: NoteId,
  ownerId: UserId,
  visibility: "public" | "private",
): Promise<void> {
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility,
    publishedAt: visibility === "public" ? TZ : null,
    updatedAt: TZ,
    version: 0,
  });
}

async function seedTag(
  container: TestContainer,
  ownerId: UserId,
  noteId: NoteId,
  name: string,
): Promise<void> {
  const id = nextId(0x0e);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name.toLowerCase(),
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  await container.db.insert(schema.noteTags).values({ noteId, tagId: id });
}

describe("listRelatedPublicNotes (integration)", () => {
  const getContainer = setupTestContainer();

  it("excludes the current note and caps at limit", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);

    const current = await seedNote(container, owner, dir);
    await seedPublication(container, current, owner, "public");

    const others: NoteId[] = [];
    for (let i = 0; i < 6; i += 1) {
      const n = await seedNote(container, owner, dir);
      await seedPublication(container, n, owner, "public");
      others.push(n);
    }

    const result = await listRelatedPublicNotes({
      container,
      input: {
        kind: "byOwnerId",
        ownerId: owner,
        excludeNoteId: current,
        limit: 4,
      },
    });

    expect(result.notes).toHaveLength(4);
    expect(result.notes.map((n) => n.id)).not.toContain(current as string);
  });

  it("returns only public, active notes with their tag + publishedAt", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);

    const current = await seedNote(container, owner, dir);
    await seedPublication(container, current, owner, "public");

    const publicNote = await seedNote(container, owner, dir);
    await seedPublication(container, publicNote, owner, "public");
    await seedTag(container, owner, publicNote, "cloudflare");

    const privateNote = await seedNote(container, owner, dir);
    await seedPublication(container, privateNote, owner, "private");

    const trashedPublic = await seedNote(container, owner, dir, {
      status: "trashed",
    });
    await seedPublication(container, trashedPublic, owner, "public");

    const result = await listRelatedPublicNotes({
      container,
      input: {
        kind: "byOwnerId",
        ownerId: owner,
        excludeNoteId: current,
        limit: 4,
      },
    });

    expect(result.notes.map((n) => n.id)).toEqual([publicNote]);
    expect(result.notes[0]?.tagNames).toEqual(["cloudflare"]);
    expect(result.notes[0]?.publishedAt).toBe(TZ);
  });

  it("resolves the owner by username", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);

    const current = await seedNote(container, owner, dir);
    await seedPublication(container, current, owner, "public");
    const other = await seedNote(container, owner, dir);
    await seedPublication(container, other, owner, "public");

    // Recover the seeded username deterministically (matches seedUser format).
    const username = `u-${(owner as string).slice(9, 13)}`;
    const result = await listRelatedPublicNotes({
      container,
      input: {
        kind: "byUsername",
        username,
        excludeNoteId: current,
        limit: 4,
      },
    });

    expect(result.notes.map((n) => n.id)).toEqual([other]);
  });
});
