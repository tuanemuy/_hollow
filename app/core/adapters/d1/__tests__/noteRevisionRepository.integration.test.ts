import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { NoteRevision } from "@/core/domain/note/revision";
import {
  ContentHtml,
  FrontMatter,
  NoteId,
  NoteRevisionId,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

const TZ = new Date("2026-05-23T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `01957d00-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<string> {
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
  return id;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: string,
): Promise<string> {
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
  return id;
}

async function seedNote(
  container: TestContainer,
  ownerId: string,
  directoryId: string,
): Promise<string> {
  const id = nextId(0x03);
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
    version: 0,
  });
  return id;
}

function makeRevision(params: {
  id: string;
  noteId: string;
  ownerId: string;
  title?: string;
  contentHtml?: string;
  createdAt: Date;
}): NoteRevision {
  return NoteRevision.create(
    {
      id: params.id,
      noteId: NoteId.create(params.noteId),
      ownerId: params.ownerId as Parameters<
        typeof NoteRevision.create
      >[0]["ownerId"],
      title: NoteTitle.create(params.title ?? "snapshot"),
      contentHtml: ContentHtml.create(params.contentHtml ?? "<p>body</p>"),
      frontMatter: FrontMatter.empty(),
      createdByUserId: params.ownerId as Parameters<
        typeof NoteRevision.create
      >[0]["createdByUserId"],
    },
    params.createdAt,
  );
}

describe("D1NoteRevisionRepository (integration)", () => {
  it("inserts a revision row that round-trips via findById", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const revisionId = nextId(0x04);

    await container.unitOfWorkProvider.run(async (ctx) => {
      await ctx.noteRevisionRepository.insert(
        makeRevision({
          id: revisionId,
          noteId,
          ownerId: owner,
          title: "fresh",
          contentHtml: "<p>fresh body</p>",
          createdAt: new Date("2026-05-23T01:00:00.000Z"),
        }),
      );
    });

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRevisionRepository }) =>
        noteRevisionRepository.findById(NoteRevisionId.create(revisionId)),
    );

    expect(found).not.toBeNull();
    expect(found?.id as unknown as string).toBe(revisionId);
    expect(found?.title as unknown as string).toBe("fresh");
  });

  it("lists revisions newest-first by created_at", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    const r1Id = nextId(0x05);
    const r2Id = nextId(0x06);
    const r3Id = nextId(0x07);

    await container.unitOfWorkProvider.run(async (ctx) => {
      await ctx.noteRevisionRepository.insert(
        makeRevision({
          id: r1Id,
          noteId,
          ownerId: owner,
          createdAt: new Date("2026-05-23T01:00:00.000Z"),
        }),
      );
      await ctx.noteRevisionRepository.insert(
        makeRevision({
          id: r2Id,
          noteId,
          ownerId: owner,
          createdAt: new Date("2026-05-23T02:00:00.000Z"),
        }),
      );
      await ctx.noteRevisionRepository.insert(
        makeRevision({
          id: r3Id,
          noteId,
          ownerId: owner,
          createdAt: new Date("2026-05-23T03:00:00.000Z"),
        }),
      );
    });

    const listed = await container.unitOfWorkProvider.run(
      async ({ noteRevisionRepository }) =>
        noteRevisionRepository.findByNoteId(NoteId.create(noteId), {
          limit: 10,
          offset: 0,
        }),
    );
    expect(listed.map((r) => r.id as unknown as string)).toEqual([
      r3Id,
      r2Id,
      r1Id,
    ]);
  });

  it("countByNoteId reflects the number of stored revisions", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await container.unitOfWorkProvider.run(async (ctx) => {
      await ctx.noteRevisionRepository.insert(
        makeRevision({
          id: nextId(0x08),
          noteId,
          ownerId: owner,
          createdAt: new Date("2026-05-23T01:00:00.000Z"),
        }),
      );
      await ctx.noteRevisionRepository.insert(
        makeRevision({
          id: nextId(0x09),
          noteId,
          ownerId: owner,
          createdAt: new Date("2026-05-23T02:00:00.000Z"),
        }),
      );
    });

    const count = await container.unitOfWorkProvider.run(
      async ({ noteRevisionRepository }) =>
        noteRevisionRepository.countByNoteId(NoteId.create(noteId)),
    );
    expect(count).toBe(2);
  });

  it("deleteOldestForNote prunes oldest rows beyond keepCount", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    const ids = [nextId(0x0a), nextId(0x0b), nextId(0x0c), nextId(0x0d)];
    await container.unitOfWorkProvider.run(async (ctx) => {
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i] as string;
        await ctx.noteRevisionRepository.insert(
          makeRevision({
            id,
            noteId,
            ownerId: owner,
            createdAt: new Date(`2026-05-23T0${i + 1}:00:00.000Z`),
          }),
        );
      }
    });

    const deleted = await container.unitOfWorkProvider.run(
      async ({ noteRevisionRepository }) =>
        noteRevisionRepository.deleteOldestForNote(NoteId.create(noteId), 2),
    );
    expect(deleted).toBe(2);

    const remaining = await container.db
      .select({ id: schema.noteRevisions.id })
      .from(schema.noteRevisions)
      .where(eq(schema.noteRevisions.noteId, noteId));
    const remainingIds = new Set(remaining.map((r) => r.id));
    expect(remainingIds.size).toBe(2);
    expect(remainingIds.has(ids[2] as string)).toBe(true);
    expect(remainingIds.has(ids[3] as string)).toBe(true);
  });

  it("deleteOldestForNote is a no-op when below keepCount", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await container.unitOfWorkProvider.run(async (ctx) => {
      await ctx.noteRevisionRepository.insert(
        makeRevision({
          id: nextId(0x0e),
          noteId,
          ownerId: owner,
          createdAt: new Date("2026-05-23T01:00:00.000Z"),
        }),
      );
    });

    const deleted = await container.unitOfWorkProvider.run(
      async ({ noteRevisionRepository }) =>
        noteRevisionRepository.deleteOldestForNote(NoteId.create(noteId), 5),
    );
    expect(deleted).toBe(0);
  });

  it("CASCADE deletes revisions when the parent note is purged", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await container.unitOfWorkProvider.run(async (ctx) => {
      await ctx.noteRevisionRepository.insert(
        makeRevision({
          id: nextId(0x0f),
          noteId,
          ownerId: owner,
          createdAt: new Date("2026-05-23T01:00:00.000Z"),
        }),
      );
    });

    await container.db.delete(schema.notes).where(eq(schema.notes.id, noteId));

    const remaining = await container.db
      .select({ id: schema.noteRevisions.id })
      .from(schema.noteRevisions)
      .where(eq(schema.noteRevisions.noteId, noteId));
    expect(remaining).toEqual([]);
  });
});
