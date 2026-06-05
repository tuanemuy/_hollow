import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { getPublicationState } from "../getPublicationState";

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();
const PUBLISHED_AT = new Date("2026-03-02T12:34:56.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7e0-${block}-7000-8000-0000000000${tail}`;
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
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml: "<p>seed</p>",
    frontMatterJson: "{}",
    status,
    trashedAt: status === "trashed" ? TZ : null,
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

async function seedPublicationState(
  container: TestContainer,
  noteId: NoteId,
  ownerId: UserId,
  opts: {
    visibility?: "private" | "unlisted" | "public";
    publishedAt?: string | null;
  } = {},
): Promise<void> {
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility: opts.visibility ?? "private",
    publishedAt: opts.publishedAt ?? null,
    updatedAt: TZ,
    version: 0,
  });
}

describe("getPublicationState (integration)", () => {
  const getContainer = setupTestContainer();

  it("returns null when the note has no publication-state row (default private)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    const { publicationState } = await getPublicationState({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(publicationState).toBeNull();
  });

  it("projects the publication state with visibility and published instant for a public note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    await seedPublicationState(container, noteId, owner, {
      visibility: "public",
      publishedAt: PUBLISHED_AT,
    });

    const { publicationState } = await getPublicationState({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(publicationState).not.toBeNull();
    expect(publicationState?.noteId).toBe(noteId);
    expect(publicationState?.visibility).toBe("public");
    expect(publicationState?.publishedAt).toBe(PUBLISHED_AT);
  });

  it("returns publishedAt === null for a private state row", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    await seedPublicationState(container, noteId, owner, {
      visibility: "private",
      publishedAt: null,
    });

    const { publicationState } = await getPublicationState({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(publicationState?.visibility).toBe("private");
    expect(publicationState?.publishedAt).toBeNull();
  });

  it("throws ForbiddenError when the caller is not the note owner", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    try {
      await getPublicationState({
        container,
        input: { actorUserId: stranger, noteId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isForbiddenError(error)) {
        throw error;
      }
      expect(error.code).toBe("NOTE_NOT_OWNED");
    }
  });

  it("throws NotFoundError when the note does not exist", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const missing = nextId(0x0c) as NoteId;

    try {
      await getPublicationState({
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

  it("throws a Trashed BusinessRuleError when the note is trashed", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    try {
      await getPublicationState({
        container,
        input: { actorUserId: owner, noteId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe("note_trashed");
    }
  });
});
