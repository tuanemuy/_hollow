import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import { isForbiddenError, isNotFoundError } from "@/core/application/errors";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { listNoteRevisions } from "../listNoteRevisions";
import { saveNote } from "../saveNote";

const TZ = new Date("2026-05-23T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `01957e00-${block}-7000-8000-0000000000${tail}`;
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

describe("listNoteRevisions (integration)", () => {
  const getContainer = setupTestContainer();

  it("returns revisions newest-first after multiple SaveNote calls", async () => {
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
    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        contentHtml: "<p>v2</p>",
        requireLock: false,
      },
    });

    const { revisions, totalCount } = await listNoteRevisions({
      container,
      input: { actorUserId: owner, noteId, limit: 10, offset: 0 },
    });
    expect(totalCount).toBe(2);
    expect(revisions).toHaveLength(2);
    // Both `createdAt` values are ISO 8601 strings, so lexical
    // comparison matches chronological comparison.
    expect(
      (revisions[0]?.createdAt ?? "") >= (revisions[1]?.createdAt ?? ""),
    ).toBe(true);
  });

  it("returns an empty list when no revision has been written yet", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    const { revisions, totalCount } = await listNoteRevisions({
      container,
      input: { actorUserId: owner, noteId, limit: 10, offset: 0 },
    });
    expect(revisions).toEqual([]);
    expect(totalCount).toBe(0);
  });

  it("forbids accessing another user's note history", async () => {
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
        contentHtml: "<p>v1</p>",
        requireLock: false,
      },
    });

    try {
      await listNoteRevisions({
        container,
        input: { actorUserId: stranger, noteId, limit: 10, offset: 0 },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("raises NotFoundError when the note does not exist", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const missingId = nextId(0x04) as NoteId;

    try {
      await listNoteRevisions({
        container,
        input: { actorUserId: owner, noteId: missingId, limit: 10, offset: 0 },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });

  it("trims to the oldest revisions beyond the retention ceiling", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    // Lower the ceiling so the test runs in reasonable time. The default
    // is 50; this writes an explicit row with maxNoteRevisionsPerNote=3.
    await container.unitOfWorkProvider.run(async (ctx) => {
      const { entity, expectedVersion } =
        await ctx.instanceSettingsRepository.get();
      const next = {
        ...entity,
        limits: {
          ...entity.limits,
          maxNoteRevisionsPerNote: 3,
        },
        version: entity.version + 1,
        updatedAt: new Date(),
      } as typeof entity;
      await ctx.instanceSettingsRepository.save(next, expectedVersion);
    });

    for (let i = 0; i < 5; i += 1) {
      await saveNote({
        container,
        input: {
          actorUserId: owner,
          noteId,
          contentHtml: `<p>v${i + 1}</p>`,
          requireLock: false,
        },
      });
    }

    const { totalCount } = await listNoteRevisions({
      container,
      input: { actorUserId: owner, noteId, limit: 10, offset: 0 },
    });
    expect(totalCount).toBe(3);
  });
});
