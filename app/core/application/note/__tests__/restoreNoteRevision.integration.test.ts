import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import type { NoteId, NoteRevisionId } from "@/core/domain/note/valueObject";
import { restoreNoteRevision } from "../restoreNoteRevision";
import { saveNote } from "../saveNote";

const TZ = new Date("2026-05-23T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `01958000-${block}-7000-8000-0000000000${tail}`;
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

async function oldestRevisionId(
  container: TestContainer,
  noteId: NoteId,
): Promise<NoteRevisionId> {
  const rows = await container.db
    .select({
      id: schema.noteRevisions.id,
      createdAt: schema.noteRevisions.createdAt,
    })
    .from(schema.noteRevisions)
    .where(eq(schema.noteRevisions.noteId, noteId as unknown as string));
  const sorted = [...rows].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const id = sorted[0]?.id;
  if (id === undefined) throw new Error("no revisions stored");
  return id as NoteRevisionId;
}

describe("restoreNoteRevision (integration)", () => {
  const getContainer = setupTestContainer();

  it("writes the current state as a new revision and restores the past body", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        title: "version 1",
        contentHtml: "<p>v1</p>",
        requireLock: false,
      },
    });
    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        title: "version 2",
        contentHtml: "<p>v2</p>",
        requireLock: false,
      },
    });

    const oldest = await oldestRevisionId(container, noteId);

    const { note } = await restoreNoteRevision({
      container,
      input: { actorUserId: owner, noteId, revisionId: oldest },
    });

    expect(note.title).toBe("version 1");
    expect(note.contentHtml).toContain("v1");

    const remaining = await container.db
      .select({ id: schema.noteRevisions.id })
      .from(schema.noteRevisions)
      .where(eq(schema.noteRevisions.noteId, noteId as unknown as string));
    // 2 (from the two SaveNote calls) + 1 (safety net snapshot of the
    // state we just rolled back from) = 3.
    expect(remaining).toHaveLength(3);
  });

  it("refuses to restore into a trashed note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        contentHtml: "<p>v1</p>",
        requireLock: false,
      },
    });
    const oldest = await oldestRevisionId(container, noteId);

    await container.db
      .update(schema.notes)
      .set({ status: "trashed", trashedAt: TZ })
      .where(eq(schema.notes.id, noteId as unknown as string));

    try {
      await restoreNoteRevision({
        container,
        input: { actorUserId: owner, noteId, revisionId: oldest },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe(NoteErrorCode.AlreadyTrashed);
    }
  });

  it("fails when the revision contains media the current owner cannot use", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const otherOwner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    // Seed a media asset owned by `otherOwner` and reference it from the
    // revision body. The active note has no such media (so SaveNote
    // wouldn't have been able to write the body in the first place);
    // craft the revision row directly to simulate "the media was
    // transferred away or revoked between SaveNote and Restore".
    const foreignMediaId = nextId(0x04);
    await container.db.insert(schema.mediaAssets).values({
      id: foreignMediaId,
      ownerId: otherOwner,
      kind: "image",
      mimeType: "image/png",
      byteSize: 1024,
      backend: "r2",
      storageKey: `media/${foreignMediaId}`,
      refCount: 0,
      status: "pending",
      createdAt: TZ,
      updatedAt: TZ,
    });

    const revisionId = nextId(0x05);
    await container.db.insert(schema.noteRevisions).values({
      id: revisionId,
      noteId,
      ownerId: owner,
      title: "with foreign media",
      contentHtml: `<p><img src="/media/${foreignMediaId}" alt="x" /></p>`,
      frontMatterJson: "{}",
      createdByUserId: owner,
      createdAt: TZ,
    });

    try {
      await restoreNoteRevision({
        container,
        input: {
          actorUserId: owner,
          noteId,
          revisionId: revisionId as unknown as NoteRevisionId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe(NoteErrorCode.MediaNotOwned);
    }
  });
});
