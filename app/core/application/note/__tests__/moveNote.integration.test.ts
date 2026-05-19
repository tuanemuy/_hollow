import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { isForbiddenError } from "../../errors";
import { bulkMoveNotes } from "../bulkMoveNotes";
import { moveNote } from "../moveNote";

// spec: spec/testcases/note/index.md#MoveNote / BulkMoveNotes

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d4-${block}-7000-8000-0000000000${tail}`;
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
  opts: {
    name?: string;
    parentId?: DirectoryId | null;
    depth?: number;
  } = {},
): Promise<DirectoryId> {
  const id = nextId(0x0b);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: opts.parentId ?? null,
    name: opts.name ?? "root",
    slug: `d-${id.slice(9, 13)}`,
    depth: opts.depth ?? 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id as DirectoryId;
}

// One root + N children per owner — the unique index
// `uniq_directories_owner_root` allows only a single null-parent row per
// owner, so any test that needs two distinct directories has to nest them.
async function seedRootAndChildren(
  container: TestContainer,
  ownerId: UserId,
  childNames: readonly string[],
): Promise<{ root: DirectoryId; children: readonly DirectoryId[] }> {
  const root = await seedDirectory(container, ownerId, { name: "root" });
  const children: DirectoryId[] = [];
  for (const name of childNames) {
    children.push(
      await seedDirectory(container, ownerId, {
        name,
        parentId: root,
        depth: 1,
      }),
    );
  }
  return { root, children };
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml: "<p>seed</p>",
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
  return id as NoteId;
}

describe("moveNote (integration)", () => {
  // spec: spec/testcases/note/index.md#MoveNote
  const getContainer = setupTestContainer();

  it("moves the note to the caller's other directory and persists the new directoryId", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const { children } = await seedRootAndChildren(container, owner, [
      "src",
      "dst",
    ]);
    const src = children[0] as DirectoryId;
    const dst = children[1] as DirectoryId;
    const noteId = await seedNote(container, owner, src);

    const { note } = await moveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        newDirectoryId: dst,
      },
    });
    expect(note.directoryId).toBe(dst);
    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.directoryId).toBe(dst);
  });

  it("throws ForbiddenError when the destination directory belongs to another user", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const src = await seedDirectory(container, owner, { name: "src" });
    const foreign = await seedDirectory(container, stranger, {
      name: "theirs",
    });
    const noteId = await seedNote(container, owner, src);

    try {
      await moveNote({
        container,
        input: {
          actorUserId: owner,
          noteId,
          newDirectoryId: foreign,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isForbiddenError(error)) {
        throw error;
      }
      expect(error.code).toBe("DIRECTORY_FORBIDDEN");
    }
  });

  // Spec says ResourceNotFoundError; implementation raises
  // ForbiddenError("DIRECTORY_NOT_FOUND") because directory existence is
  // treated as part of the authorization predicate (see ADR-004).
  it("throws ForbiddenError(DIRECTORY_NOT_FOUND) when the destination directory does not exist", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const src = await seedDirectory(container, owner, { name: "src" });
    const noteId = await seedNote(container, owner, src);
    const missing = nextId(0x0b) as DirectoryId;

    try {
      await moveNote({
        container,
        input: {
          actorUserId: owner,
          noteId,
          newDirectoryId: missing,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isForbiddenError(error)) {
        throw error;
      }
      expect(error.code).toBe("DIRECTORY_NOT_FOUND");
    }
  });
});

describe("bulkMoveNotes (integration)", () => {
  // spec: spec/testcases/note/index.md#MoveNote / BulkMoveNotes
  const getContainer = setupTestContainer();

  it("accumulates partial failures while still applying the successful moves", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const { children } = await seedRootAndChildren(container, owner, [
      "src",
      "dst",
    ]);
    const src = children[0] as DirectoryId;
    const dst = children[1] as DirectoryId;
    // Stranger's note has to live under their own directory tree because
    // `notes.directory_id` FKs to `directories` and the unique-root
    // constraint forces a separate root for the stranger.
    const strangerRoot = await seedDirectory(container, stranger, {
      name: "stranger-root",
    });
    const ok = await seedNote(container, owner, src);
    const foreign = await seedNote(container, stranger, strangerRoot);
    const missing = nextId(0x0c) as NoteId;

    const { successCount, failures } = await bulkMoveNotes({
      container,
      input: {
        actorUserId: owner,
        noteIds: [ok, foreign, missing],
        newDirectoryId: dst,
      },
    });

    expect(successCount).toBe(1);
    expect(failures).toHaveLength(2);
    const codes = failures.map((f) => f.code).sort();
    // foreign note → NOTE_FORBIDDEN; missing note → NOTE_NOT_FOUND.
    expect(codes).toEqual(["NOTE_FORBIDDEN", "NOTE_NOT_FOUND"]);

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, ok as unknown as string));
    expect(rows[0]?.directoryId).toBe(dst);
  });
});
