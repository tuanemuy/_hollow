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
import type { NoteId } from "@/core/domain/note/valueObject";
import { duplicateNote } from "../duplicateNote";

// spec: spec/testcases/note/index.md#DuplicateNote

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d8-${block}-7000-8000-0000000000${tail}`;
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
  opts: {
    title?: string;
    slug?: string;
    status?: "active" | "trashed";
    mediaIds?: readonly string[];
  } = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: opts.slug ?? `n-${id.slice(9, 13)}`,
    title: opts.title ?? "seeded",
    contentHtml: "<p>seed</p>",
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
  for (const mediaId of opts.mediaIds ?? []) {
    await container.db
      .insert(schema.noteMediaRefs)
      .values({ noteId: id, mediaId });
  }
  return id as NoteId;
}

async function seedMediaAsset(
  container: TestContainer,
  ownerId: UserId,
  opts: { status?: "pending" | "attached"; refCount?: number } = {},
): Promise<string> {
  const id = nextId(0x0e);
  const status = opts.status ?? "attached";
  await container.db.insert(schema.mediaAssets).values({
    id,
    ownerId,
    kind: "image",
    mimeType: "image/png",
    byteSize: 1024,
    backend: "r2",
    storageKey: `media/${id}`,
    refCount: opts.refCount ?? (status === "attached" ? 1 : 0),
    status,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

describe("duplicateNote (integration)", () => {
  // spec: spec/testcases/note/index.md#DuplicateNote
  const getContainer = setupTestContainer();

  it("creates a new note with a '(コピー)'-suffixed title and a fresh slug", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      title: "Original",
      slug: "original",
    });

    const { note } = await duplicateNote({
      container,
      input: { actorUserId: owner, noteId },
    });

    expect(note.id).not.toBe(noteId);
    expect(note.title).toContain("(コピー)");
    expect(note.slug).not.toBe("original");

    const rows = await container.db.select().from(schema.notes);
    expect(rows).toHaveLength(2);
  });

  // Spec: trashed → "動作対象外（仕様: 拒否）". Issue #42 added the status
  // check to `duplicateNote`; trashed source notes now raise
  // `AlreadyTrashed` (reused for symmetry with `deleteNote`/`renameNote`).
  it("rejects duplicating a trashed note with BusinessRuleError(AlreadyTrashed)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      title: "Trashed source",
      slug: "trashed-source",
      status: "trashed",
    });

    const before = await container.db.select().from(schema.notes);

    try {
      await duplicateNote({
        container,
        input: { actorUserId: owner, noteId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.AlreadyTrashed);
    }

    const after = await container.db.select().from(schema.notes);
    expect(after).toHaveLength(before.length);
  });

  it("bumps the ref count of every media asset referenced by the source note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const mediaId = await seedMediaAsset(container, owner, {
      status: "attached",
      refCount: 1,
    });
    // Embed the media via `noteMediaRefs` + body markup so the note's
    // `mediaRefs` round-trips through rehydration.
    const noteId = nextId(0x0c);
    await container.db.insert(schema.notes).values({
      id: noteId,
      ownerId: owner,
      directoryId: dir,
      slug: `n-${noteId.slice(9, 13)}`,
      title: "with-media",
      contentHtml: `<p><img src="/media/${mediaId}" alt="x" /></p>`,
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
    await container.db.insert(schema.noteMediaRefs).values({ noteId, mediaId });

    await duplicateNote({
      container,
      input: { actorUserId: owner, noteId: noteId as unknown as NoteId },
    });

    const rows = await container.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, mediaId));
    expect(rows[0]?.refCount).toBe(2);
  });
});
