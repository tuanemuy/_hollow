import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { isNotFoundError } from "../../errors";
import { listPublicBacklinks } from "../listPublicBacklinks";

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7e2-${block}-7000-8000-0000000000${tail}`;
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
  opts: { status?: "active" | "trashed"; contentHtml?: string } = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: `note ${id.slice(9, 13)}`,
    contentHtml: opts.contentHtml ?? "<p>body</p>",
    frontMatterJson: "{}",
    status: opts.status ?? "active",
    trashedAt: opts.status === "trashed" ? TZ : null,
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

async function seedInternalLink(
  container: TestContainer,
  fromNoteId: NoteId,
  target: NoteId,
): Promise<void> {
  await container.db.insert(schema.noteInternalLinks).values({
    id: nextId(0x0d),
    fromNoteId,
    refKind: "id",
    refTarget: target as unknown as string,
    displayText: null,
    resolvedNoteId: target as unknown as string,
  });
}

async function seedPublication(
  container: TestContainer,
  noteId: NoteId,
  ownerId: UserId,
  visibility: "public" | "unlisted" | "private",
): Promise<void> {
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility,
    publishedAt: visibility === "public" ? TZ : null,
    updatedAt: TZ,
    version: 0,
  });
}

describe("listPublicBacklinks (integration)", () => {
  const getContainer = setupTestContainer();

  it("returns only public referrers, excluding private / unlisted / trashed", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);

    const target = await seedNote(container, owner, dir);
    await seedPublication(container, target, owner, "public");

    const publicRef = await seedNote(container, owner, dir, {
      contentHtml: `<p>see [[${target}]]</p>`,
    });
    await seedPublication(container, publicRef, owner, "public");
    await seedInternalLink(container, publicRef, target);

    const privateRef = await seedNote(container, owner, dir);
    await seedPublication(container, privateRef, owner, "private");
    await seedInternalLink(container, privateRef, target);

    const unlistedRef = await seedNote(container, owner, dir);
    await seedPublication(container, unlistedRef, owner, "unlisted");
    await seedInternalLink(container, unlistedRef, target);

    // A referrer with no publication_states row at all -> private default.
    const noStateRef = await seedNote(container, owner, dir);
    await seedInternalLink(container, noStateRef, target);

    // A public-state but trashed referrer -> excluded as not active.
    const trashedRef = await seedNote(container, owner, dir, {
      status: "trashed",
    });
    await seedPublication(container, trashedRef, owner, "public");
    await seedInternalLink(container, trashedRef, target);

    const result = await listPublicBacklinks({
      container,
      input: { noteId: target },
    });

    expect(result.backlinks.map((b) => b.noteId)).toEqual([publicRef]);
    // ADR-006: directory segments are never surfaced publicly.
    expect(result.backlinks[0]?.directorySegments).toEqual([]);
  });

  it("returns NotFound when the target note is not public", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);

    const target = await seedNote(container, owner, dir);
    await seedPublication(container, target, owner, "private");

    await expect(
      listPublicBacklinks({ container, input: { noteId: target } }),
    ).rejects.toSatisfy(isNotFoundError);
  });

  it("returns NotFound when the target note does not exist", async () => {
    const container = getContainer();
    const missing = nextId(0x0c) as NoteId;
    await expect(
      listPublicBacklinks({ container, input: { noteId: missing } }),
    ).rejects.toSatisfy(isNotFoundError);
  });
});
