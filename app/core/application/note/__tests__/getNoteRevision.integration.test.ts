import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import { isForbiddenError, isNotFoundError } from "@/core/application/errors";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId, NoteRevisionId } from "@/core/domain/note/valueObject";
import { getNoteRevision } from "../getNoteRevision";
import { saveNote } from "../saveNote";

const TZ = new Date("2026-05-23T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `01957f00-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Tester",
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
  const id = nextId(0x02);
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
): Promise<NoteId> {
  const id = nextId(0x03);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seed",
    contentHtml: "<p>seed</p>",
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    createdAt: TZ,
    updatedAt: TZ,
    version: 0,
  });
  return id as NoteId;
}

async function firstRevisionId(
  container: TestContainer,
  noteId: NoteId,
): Promise<NoteRevisionId> {
  const rows = await container.db
    .select({ id: schema.noteRevisions.id })
    .from(schema.noteRevisions)
    .where(eq(schema.noteRevisions.noteId, noteId as unknown as string));
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no revisions stored");
  return id as NoteRevisionId;
}

describe("getNoteRevision (integration)", () => {
  const getContainer = setupTestContainer();

  it("returns the snapshot plus the current note state", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        title: "snapshot title",
        contentHtml: "<p>snapshot body</p>",
        requireLock: false,
      },
    });
    const revisionId = await firstRevisionId(container, noteId);

    const result = await getNoteRevision({
      container,
      input: { actorUserId: owner, noteId, revisionId },
    });
    expect(result.revision.title).toBe("snapshot title");
    expect(result.revision.contentHtml).toContain("snapshot body");
    expect(result.note.id).toBe(noteId as unknown as string);
  });

  it("forbids accessing another user's revision via the note id check", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        contentHtml: "<p>x</p>",
        requireLock: false,
      },
    });
    const revisionId = await firstRevisionId(container, noteId);

    try {
      await getNoteRevision({
        container,
        input: { actorUserId: stranger, noteId, revisionId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("raises NotFoundError for an unknown revision id", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const missingRevision = nextId(0x04) as NoteRevisionId;

    try {
      await getNoteRevision({
        container,
        input: { actorUserId: owner, noteId, revisionId: missingRevision },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });

  it("rejects cross-note revision lookups (revisionId belongs to another note)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteA = await seedNote(container, owner, dir);
    const noteB = await seedNote(container, owner, dir);

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId: noteA,
        contentHtml: "<p>a</p>",
        requireLock: false,
      },
    });
    const revisionOfA = await firstRevisionId(container, noteA);

    try {
      await getNoteRevision({
        container,
        input: {
          actorUserId: owner,
          noteId: noteB,
          revisionId: revisionOfA,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });
});
