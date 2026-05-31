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
import { saveNoteDraft } from "../saveNoteDraft";

// spec: spec/testcases/note/index.md#SaveNoteDraft

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d2-${block}-7000-8000-0000000000${tail}`;
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

type SeedNoteOpts = Readonly<{
  status?: "active" | "trashed";
  editLockUserId?: UserId | null;
  contentHtml?: string;
  tagIds?: readonly string[];
}>;

const farFuture = (): Date => new Date(Date.now() + 25 * 60 * 1000);
const lockAcquiredAt = (): Date => new Date(Date.now() - 1000);

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: SeedNoteOpts = {},
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
    editLockUserId: opts.editLockUserId ?? null,
    editLockAcquiredAt: opts.editLockUserId
      ? lockAcquiredAt().toISOString()
      : null,
    editLockExpiresAt: opts.editLockUserId ? farFuture().toISOString() : null,
    version: 0,
  });
  for (const tagId of opts.tagIds ?? []) {
    await container.db.insert(schema.noteTags).values({ noteId: id, tagId });
  }
  return id as NoteId;
}

async function seedTag(
  container: TestContainer,
  ownerId: UserId,
  name: string,
): Promise<string> {
  const id = nextId(0x0d);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

describe("saveNoteDraft (integration)", () => {
  // spec: spec/testcases/note/index.md#SaveNoteDraft
  const getContainer = setupTestContainer();

  it("throws BusinessRuleError(EditLockedByOther) when another user holds the lock", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: stranger,
    });

    try {
      await saveNoteDraft({
        container,
        input: {
          actorUserId: owner,
          noteId,
          contentHtml: "<p>draft</p>",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.EditLockedByOther);
    }
  });

  it("persists the body update but leaves the existing tag set untouched (no tag reconciliation)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tagId = await seedTag(container, owner, "kept");
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: owner,
      contentHtml: "<p>before #kept</p>",
      tagIds: [tagId],
    });

    await saveNoteDraft({
      container,
      input: {
        actorUserId: owner,
        noteId,
        contentHtml: "<p>after body with no hashtag</p>",
      },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.contentHtml).toContain("after body");

    // Draft path does not reconcile tags — the previously-linked tag
    // stays attached even though the new body no longer mentions it.
    const links = await container.db
      .select()
      .from(schema.noteTags)
      .where(eq(schema.noteTags.noteId, noteId as unknown as string));
    expect(links).toHaveLength(1);
    expect(links[0]?.tagId).toBe(tagId);
  });

  it("throws BusinessRuleError(AlreadyTrashed) when the note is trashed", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    try {
      await saveNoteDraft({
        container,
        input: {
          actorUserId: owner,
          noteId,
          contentHtml: "<p>nope</p>",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.AlreadyTrashed);
    }
  });
});
