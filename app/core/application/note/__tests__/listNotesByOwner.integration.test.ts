import { describe, expect, it } from "vitest";
import { createTestContainer } from "@/core/adapters/d1/__tests__/helpers";
import * as schema from "@/core/adapters/d1/schema";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { listNotesByOwner } from "../listNotesByOwner";
import { listNotesInDirectory } from "../listNotesInDirectory";

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

async function seedChildDirectory(
  container: Container,
  ownerId: UserId,
  parentId: string,
): Promise<string> {
  const id = nextId(0x0b);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId,
    name: "child",
    slug: `d-${id.slice(9, 13)}`,
    depth: 1,
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

async function seedTrashedNote(
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
    status: "trashed",
    trashedAt: TZ,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id as NoteId;
}

async function seedTag(
  container: Container,
  ownerId: UserId,
  name: string,
): Promise<TagId> {
  const id = nextId(0x0e);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id as unknown as TagId;
}

async function linkTag(
  container: Container,
  noteId: NoteId,
  tagId: TagId,
): Promise<void> {
  await container.db.insert(schema.noteTags).values({
    noteId,
    tagId: tagId as unknown as string,
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

  // Issue #387 — `directoryId` must restrict the listing to notes living
  // directly under the supplied directory (and `count` must agree).
  it("passes `directoryId` through to the adapter — only direct-child notes returned, count matches", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const child = await seedChildDirectory(container, owner, root);
    const inRoot = await seedNote(container, owner, root, "in-root");
    await seedNote(container, owner, child, "in-child");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        directoryId: root as unknown as DirectoryId,
      },
    });
    expect(notes.map((n) => n.id as string)).toEqual([inRoot]);
    expect(count).toBe(1);
  });

  // Issue #387 ADR-001 — direct-equality only: selecting a parent
  // directory must NOT surface notes that live in a child directory.
  it("does not return child-directory notes when the parent `directoryId` is supplied", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const child = await seedChildDirectory(container, owner, root);
    const inChild = await seedNote(container, owner, child, "in-child");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        directoryId: root as unknown as DirectoryId,
      },
    });
    expect(notes.map((n) => n.id as string)).not.toContain(inChild);
    expect(notes).toHaveLength(0);
    expect(count).toBe(0);
  });

  // Issue #387 (S-002) — `directoryId` rides the `conditions`
  // (single-query) path while `tagIds` resolves a candidate set; the two
  // must intersect correctly.
  it("combines `directoryId` with `tagIds` — only notes in the directory carrying the tag are returned", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const child = await seedChildDirectory(container, owner, root);
    const tag = await seedTag(container, owner, "a");
    // In root, tagged — the only match.
    const match = await seedNote(container, owner, root, "match");
    await linkTag(container, match, tag);
    // In root but untagged.
    await seedNote(container, owner, root, "root-untagged");
    // In child, tagged — excluded by the directory filter.
    const childTagged = await seedNote(container, owner, child, "child-tagged");
    await linkTag(container, childTagged, tag);

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        directoryId: root as unknown as DirectoryId,
        tagIds: [tag],
      },
    });
    expect(notes.map((n) => n.id as string)).toEqual([match]);
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// spec/testcases/note/index.md#ListNotesByOwner / ListNotesInDirectory
// ---------------------------------------------------------------------------

describe("listNotesByOwner — spec table cases (integration)", () => {
  // spec: spec/testcases/note/index.md#ListNotesByOwner / ListNotesInDirectory
  it("paginates with limit=20 and exposes the slice via the count total", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const TOTAL = 50;
    for (let i = 0; i < TOTAL; i += 1) {
      await seedNote(
        container,
        owner,
        dir,
        `n-${i.toString().padStart(2, "0")}`,
      );
    }

    const page1 = await listNotesByOwner({
      container,
      input: { actorUserId: owner, page: 1, limit: 20 },
    });
    expect(page1.notes).toHaveLength(20);
    expect(page1.count).toBe(TOTAL);

    const page3 = await listNotesByOwner({
      container,
      input: { actorUserId: owner, page: 3, limit: 20 },
    });
    expect(page3.notes).toHaveLength(10);
  });

  it("returns 0 notes when every note is trashed and the filter requests active status", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    for (let i = 0; i < 3; i += 1) {
      await seedTrashedNote(container, owner, dir, `t-${i}`);
    }

    const { notes } = await listNotesByOwner({
      container,
      input: { actorUserId: owner, page: 1, limit: 50, status: "active" },
    });
    expect(notes).toHaveLength(0);
  });

  it("combines multiple tagIds with AND semantics — only notes carrying every tag are returned", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedTag(container, owner, "a");
    const b = await seedTag(container, owner, "b");
    const both = await seedNote(container, owner, dir, "both");
    const onlyA = await seedNote(container, owner, dir, "only-a");
    await seedNote(container, owner, dir, "neither");
    await linkTag(container, both, a);
    await linkTag(container, both, b);
    await linkTag(container, onlyA, a);

    const { notes } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        tagIds: [a, b],
      },
    });
    expect(notes.map((n) => n.id as string)).toEqual([both]);
  });
});

// ---------------------------------------------------------------------------
// Issue #30 — `count` must reflect the same filter set as `notes` so the
// UI's "N notes" total cannot disagree with the visible slice.
// ---------------------------------------------------------------------------

describe("listNotesByOwner — count reflects filters", () => {
  it("counts only notes matching the visibility filter", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const pub = await seedNote(container, owner, dir, "pub");
    const unl = await seedNote(container, owner, dir, "unl");
    await seedNote(container, owner, dir, "implicit-priv");
    await seedPublicationState(container, pub, owner, "public");
    await seedPublicationState(container, unl, owner, "unlisted");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        visibility: ["public"],
      },
    });
    expect(notes).toHaveLength(1);
    expect(count).toBe(1);
  });

  it("counts only notes matching every tag (AND semantics)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedTag(container, owner, "a");
    const b = await seedTag(container, owner, "b");
    const both = await seedNote(container, owner, dir, "both");
    const onlyA = await seedNote(container, owner, dir, "only-a");
    await seedNote(container, owner, dir, "neither");
    await linkTag(container, both, a);
    await linkTag(container, both, b);
    await linkTag(container, onlyA, a);

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        tagIds: [a, b],
      },
    });
    expect(notes).toHaveLength(1);
    expect(count).toBe(1);
  });

  it("counts only active notes when status='active' is supplied", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, "alive");
    await seedTrashedNote(container, owner, dir, "trash-1");
    await seedTrashedNote(container, owner, dir, "trash-2");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        status: "active",
      },
    });
    expect(notes).toHaveLength(1);
    expect(count).toBe(1);
  });

  it("counts only notes that reference the target when `referencingNoteId` is supplied", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir, "target");
    const referrer = await seedNote(container, owner, dir, "referrer");
    await seedNote(container, owner, dir, "unrelated-1");
    await seedNote(container, owner, dir, "unrelated-2");
    await seedInternalLink(container, referrer, target);

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        referencingNoteId: target,
      },
    });
    expect(notes).toHaveLength(1);
    expect(count).toBe(1);
  });

  // Issue #30 — guards the canonical pagination case where the visible
  // slice is smaller than the filter-aware total. Prior to the fix
  // `count` reported every note owned by the user, so this test would
  // have read `count === 5` against a visible slice of 2.
  it("returns count > limit when the filtered total exceeds the page limit", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const publicIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await seedNote(container, owner, dir, `pub-${i}`);
      await seedPublicationState(container, id, owner, "public");
      publicIds.push(id);
    }
    for (let i = 0; i < 2; i += 1) {
      await seedNote(container, owner, dir, `priv-${i}`);
    }

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 2,
        visibility: ["public"],
      },
    });
    expect(notes).toHaveLength(2);
    expect(count).toBe(3);
  });

  it("returns count = 0 when an empty visibility array is supplied", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, "n");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        visibility: [],
      },
    });
    expect(notes).toHaveLength(0);
    expect(count).toBe(0);
  });
});

describe("listNotesInDirectory (integration)", () => {
  // spec: spec/testcases/note/index.md#ListNotesByOwner / ListNotesInDirectory
  it("returns only the notes that live directly under the directory", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    // A sibling subdirectory holds an unrelated note; the listing must
    // not surface it.
    const childId = nextId(0x0b);
    await container.db.insert(schema.directories).values({
      id: childId,
      ownerId: owner,
      parentId: root,
      name: "child",
      slug: `d-${childId.slice(9, 13)}`,
      depth: 1,
      version: 0,
      createdAt: TZ,
      updatedAt: TZ,
    });
    const inRoot = await seedNote(container, owner, root, "in-root");
    await seedNote(container, owner, childId, "in-child");

    const { notes } = await listNotesInDirectory({
      container,
      input: {
        actorUserId: owner,
        directoryId: root as unknown as DirectoryId,
        page: 1,
        limit: 50,
      },
    });
    expect(notes.map((n) => n.id as string)).toEqual([inRoot]);
  });
});
