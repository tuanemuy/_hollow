import { describe, expect, it } from "vitest";
import { createTestContainer } from "@/core/adapters/d1/__tests__/helpers";
import * as schema from "@/core/adapters/d1/schema";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import { listNotesByOwner } from "../listNotesByOwner";

/**
 * `listNotesByOwner` is exercised against a real D1 binding so the
 * publication-state join can be verified end-to-end. A pure unit test
 * with mocked repositories would not catch the actual `findByNoteIds`
 * SQL semantics (which row absences become `'private'` fallbacks).
 */

const NOW = new Date("2026-01-01T00:00:00.000Z");
const TZ = NOW.toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const prefHex = prefix.toString(16).padStart(2, "0");
  return `0193e7d0-${block}-7000-8000-0000000000${prefHex}`;
};

type Container = ReturnType<typeof createTestContainer>;

async function seedUser(container: Container): Promise<UserId> {
  const id = nextId(0x0a);
  await container.db.insert(schema.users).values({
    id,
    name: "T",
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username: `u-${id.slice(9, 13)}`,
    displayUsername: null,
    role: "member",
    banned: 0,
    banReason: null,
    banExpires: null,
    bio: null,
    avatarMediaId: null,
  });
  return id as UserId;
}

async function seedDirectory(
  container: Container,
  ownerId: UserId,
): Promise<string> {
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
  return id;
}

async function seedNote(
  container: Container,
  ownerId: UserId,
  directoryId: string,
  title: string,
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title,
    contentHtml: "<p>body</p>",
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

async function seedPublicationState(
  container: Container,
  noteId: NoteId,
  ownerId: UserId,
  visibility: PublicationVisibility,
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

async function seedInternalLink(
  container: Container,
  fromNoteId: NoteId,
  resolvedNoteId: NoteId,
): Promise<void> {
  const id = nextId(0x0d);
  await container.db.insert(schema.noteInternalLinks).values({
    id,
    fromNoteId,
    refKind: "id",
    refTarget: resolvedNoteId,
    displayText: null,
    resolvedNoteId,
  });
}

describe("listNotesByOwner — visibility projection (integration)", () => {
  it("projects the real visibility when a publication_states row exists", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const note = await seedNote(container, owner, dir, "n");
    await seedPublicationState(container, note, owner, "public");

    const { notes } = await listNotesByOwner({
      container,
      input: { actorUserId: owner, page: 1, limit: 50 },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.visibility).toBe("public");
  });

  it("falls back to 'private' when no publication_states row exists", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, "n");

    const { notes } = await listNotesByOwner({
      container,
      input: { actorUserId: owner, page: 1, limit: 50 },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.visibility).toBe("private");
  });

  // T-W-006: 4-way mix exercises every visibility resolution path in a
  // single listing — explicit public/unlisted rows, an explicit private
  // row (publication_states present), and an implicit private (row
  // absent, falls back to the domain default).
  it("projects each note's visibility independently in a mixed listing", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const pub = await seedNote(container, owner, dir, "pub");
    const unl = await seedNote(container, owner, dir, "unl");
    const explicitPriv = await seedNote(container, owner, dir, "explicit");
    const implicitPriv = await seedNote(container, owner, dir, "implicit");
    await seedPublicationState(container, pub, owner, "public");
    await seedPublicationState(container, unl, owner, "unlisted");
    await seedPublicationState(container, explicitPriv, owner, "private");

    const { notes } = await listNotesByOwner({
      container,
      input: { actorUserId: owner, page: 1, limit: 50 },
    });
    const byId = new Map(notes.map((n) => [n.id as string, n.visibility]));
    expect(byId.get(pub)).toBe("public");
    expect(byId.get(unl)).toBe("unlisted");
    expect(byId.get(explicitPriv)).toBe("private");
    expect(byId.get(implicitPriv)).toBe("private");
  });
});

describe("listNotesByOwner — input filters (integration)", () => {
  it("passes `visibility` through to the adapter", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const pub = await seedNote(container, owner, dir, "pub");
    const priv = await seedNote(container, owner, dir, "priv");
    await seedPublicationState(container, pub, owner, "public");
    await seedPublicationState(container, priv, owner, "private");

    const { notes } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        visibility: ["public"],
      },
    });
    expect(notes.map((n) => n.id as string)).toEqual([pub]);
  });

  it("passes `referencingNoteId` through to the adapter", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir, "target");
    const referrer = await seedNote(container, owner, dir, "referrer");
    await seedNote(container, owner, dir, "unrelated");
    await seedInternalLink(container, referrer, target);

    const { notes } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        referencingNoteId: target,
      },
    });
    expect(notes.map((n) => n.id as string)).toEqual([referrer]);
  });
});
