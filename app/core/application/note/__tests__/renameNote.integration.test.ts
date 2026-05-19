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
import { renameNote } from "../renameNote";

// spec: spec/testcases/note/index.md#RenameNote

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d3-${block}-7000-8000-0000000000${tail}`;
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
  opts: { slug?: string; title?: string; status?: "active" | "trashed" } = {},
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
  return id as NoteId;
}

describe("renameNote (integration)", () => {
  // spec: spec/testcases/note/index.md#RenameNote
  const getContainer = setupTestContainer();

  it("updates the title only and preserves the existing slug when regenerateSlug=false", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      slug: "original-slug",
      title: "Original",
    });

    const { note } = await renameNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        newTitle: "Renamed",
        regenerateSlug: false,
      },
    });

    expect(note.title).toBe("Renamed");
    expect(note.slug).toBe("original-slug");
    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.slug).toBe("original-slug");
  });

  it("mints a fresh slug with a numeric suffix when regenerateSlug=true and the derived slug collides", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // Existing sibling already owns the slug we'd derive from the new
    // title, forcing the suffix path.
    await seedNote(container, owner, dir, { slug: "taken-name" });
    const noteId = await seedNote(container, owner, dir, {
      slug: "original-slug",
      title: "Original",
    });

    const { note } = await renameNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        newTitle: "Taken Name",
        regenerateSlug: true,
      },
    });

    expect(note.title).toBe("Taken Name");
    expect(note.slug).not.toBe("taken-name");
    expect(note.slug.startsWith("taken-name")).toBe(true);
    expect(note.slug).toMatch(/-\d+$/);
  });

  it("throws BusinessRuleError(AlreadyTrashed) when the note is trashed", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    try {
      await renameNote({
        container,
        input: {
          actorUserId: owner,
          noteId,
          newTitle: "no-go",
          regenerateSlug: false,
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
