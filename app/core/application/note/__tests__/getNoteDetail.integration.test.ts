import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { getBacklinks } from "../getBacklinks";
import { getNoteDetail } from "../getNoteDetail";

// spec: spec/testcases/note/index.md#GetNoteDetail / GetBacklinks

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d7-${block}-7000-8000-0000000000${tail}`;
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

async function seedChildDirectory(
  container: TestContainer,
  ownerId: UserId,
  parent: { id: DirectoryId; depth: number },
  name: string,
): Promise<{ id: DirectoryId; depth: number }> {
  const id = nextId(0x0b);
  const depth = parent.depth + 1;
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: parent.id,
    name,
    slug: `d-${id.slice(9, 13)}`,
    depth,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return { id: id as DirectoryId, depth };
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: { status?: "active" | "trashed"; contentHtml?: string } = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml: opts.contentHtml ?? "<p>seed</p>",
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
  return id as NoteId;
}

async function seedInternalLink(
  container: TestContainer,
  fromNoteId: NoteId,
  resolvedNoteId: NoteId,
): Promise<void> {
  const id = nextId(0x0d);
  await container.db.insert(schema.noteInternalLinks).values({
    id,
    fromNoteId,
    refKind: "id",
    refTarget: resolvedNoteId,
    displayText: null,
    resolvedNoteId,
  });
}

describe("getNoteDetail (integration)", () => {
  // spec: spec/testcases/note/index.md#GetNoteDetail
  const getContainer = setupTestContainer();

  it("returns the NoteDTO, backlinks list, and directoryPath for the caller's own note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir);
    await seedInternalLink(container, referrer, noteId);

    const { note, backlinks, directoryPath } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(note.id).toBe(noteId);
    expect(backlinks.map((b) => b.noteId as string)).toContain(referrer);
    expect(typeof directoryPath).toBe("string");
  });

  it("returns directorySegments root→leaf with {id,name} for a nested directory", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const parent = await seedChildDirectory(
      container,
      owner,
      { id: root, depth: 0 },
      "parent",
    );
    const child = await seedChildDirectory(container, owner, parent, "child");
    const noteId = await seedNote(container, owner, child.id);

    const { directorySegments } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(directorySegments).toEqual([
      { id: parent.id as string, name: "parent" },
      { id: child.id as string, name: "child" },
    ]);
  });

  it("returns an empty directorySegments array for a root-level note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, root);

    const { directorySegments } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(directorySegments).toEqual([]);
  });

  it("derives each backlink snippet from the referrer body's plaintext head", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir, {
      contentHtml: "<p>referrer body excerpt</p>",
    });
    await seedInternalLink(container, referrer, noteId);

    const { backlinks } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.snippet).toBe("referrer body excerpt");
  });

  it("yields a null backlink snippet when the referrer body sanitises to empty text", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir, {
      contentHtml: "<p></p>",
    });
    await seedInternalLink(container, referrer, noteId);

    const { backlinks } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.snippet).toBeNull();
  });

  it("caps the backlink snippet at 200 characters for a long referrer body", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir, {
      contentHtml: `<p>${"a".repeat(250)}</p>`,
    });
    await seedInternalLink(container, referrer, noteId);

    const { backlinks } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.snippet?.length).toBe(200);
  });

  it("throws ForbiddenError when the caller is not the note owner", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    try {
      await getNoteDetail({
        container,
        input: { actorUserId: stranger, noteId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isForbiddenError(error)) {
        throw error;
      }
      expect(error.code).toBe("NOTE_FORBIDDEN");
    }
  });

  it("still returns a trashed note (UI suppresses lock controls, but the read path remains open)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    const { note } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(note.id).toBe(noteId);
    expect(note.status).toBe("trashed");
  });

  it("throws NotFoundError when the note does not exist", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const missing = nextId(0x0c) as NoteId;

    try {
      await getNoteDetail({
        container,
        input: { actorUserId: owner, noteId: missing },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      expect(error.code).toBe("NOTE_NOT_FOUND");
    }
  });
});

describe("getBacklinks (integration)", () => {
  // spec: spec/testcases/note/index.md#GetNoteDetail / GetBacklinks
  const getContainer = setupTestContainer();

  it("returns each referencing note as a BacklinkDTO whose noteId matches the referrer", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir);
    const referrer1 = await seedNote(container, owner, dir);
    const referrer2 = await seedNote(container, owner, dir);
    await seedNote(container, owner, dir); // unrelated
    await seedInternalLink(container, referrer1, target);
    await seedInternalLink(container, referrer2, target);

    const { backlinks } = await getBacklinks({
      container,
      input: { actorUserId: owner, noteId: target },
    });
    const ids = backlinks.map((b) => b.noteId as string).sort();
    expect(ids).toEqual([referrer1, referrer2].sort());
  });

  it("derives each backlink snippet from the referrer body's plaintext", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir, {
      contentHtml: "<p>referrer body excerpt</p>",
    });
    await seedInternalLink(container, referrer, target);

    const { backlinks } = await getBacklinks({
      container,
      input: { actorUserId: owner, noteId: target },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.snippet).toBe("referrer body excerpt");
  });
});
