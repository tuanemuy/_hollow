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
  depth = 1,
): Promise<string> {
  const id = nextId(0x0b);
  // Owner-unique name so siblings under the same parent don't collide on
  // `uniq_directories_owner_parent_name`. `depth` defaults to 1 (direct
  // child of a root); pass it explicitly when building deeper chains.
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId,
    name: `child-${id.slice(9, 13)}`,
    slug: `d-${id.slice(9, 13)}`,
    depth,
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

  // Issue #392 — `directoryId` restricts the listing to the selected
  // directory's subtree (the directory itself + every descendant), so the
  // filter path matches the search path's subtree semantics.
  it("passes `directoryId` through to the adapter — the whole subtree (parent + child + grandchild) is returned, count matches", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const child = await seedChildDirectory(container, owner, root);
    const grandchild = await seedChildDirectory(container, owner, child, 2);
    const inRoot = await seedNote(container, owner, root, "in-root");
    const inChild = await seedNote(container, owner, child, "in-child");
    const inGrandchild = await seedNote(
      container,
      owner,
      grandchild,
      "in-grandchild",
    );

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        directoryId: root as unknown as DirectoryId,
      },
    });
    expect(new Set(notes.map((n) => n.id as string))).toEqual(
      new Set([inRoot, inChild, inGrandchild]),
    );
    expect(count).toBe(3);
  });

  // Issue #392 — a sibling subtree must NOT surface when filtering on an
  // unrelated parent.
  it("excludes notes that live outside the selected subtree", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const child = await seedChildDirectory(container, owner, root);
    const sibling = await seedChildDirectory(container, owner, root);
    const inChild = await seedNote(container, owner, child, "in-child");
    const inSibling = await seedNote(container, owner, sibling, "in-sibling");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        directoryId: child as unknown as DirectoryId,
      },
    });
    expect(notes.map((n) => n.id as string)).toEqual([inChild]);
    expect(notes.map((n) => n.id as string)).not.toContain(inSibling);
    expect(count).toBe(1);
  });

  // Issue #392 — `directoryIds` resolves to a single `inArray` predicate
  // on the `conditions` (single-query) path while `tagIds` resolves a
  // candidate set; the two must intersect correctly across the subtree.
  it("combines `directoryId` with `tagIds` — only subtree notes carrying the tag are returned", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    // An owner has a single root; the selected `parent` and the unrelated
    // `sibling` both live under it so the directory filter (parent's
    // subtree) genuinely excludes the sibling.
    const root = await seedDirectory(container, owner);
    const parent = await seedChildDirectory(container, owner, root);
    const child = await seedChildDirectory(container, owner, parent, 2);
    const sibling = await seedChildDirectory(container, owner, root);
    const tag = await seedTag(container, owner, "a");
    // In parent, tagged — a match.
    const parentMatch = await seedNote(
      container,
      owner,
      parent,
      "parent-match",
    );
    await linkTag(container, parentMatch, tag);
    // In child (descendant of parent), tagged — also a match (subtree).
    const childMatch = await seedNote(container, owner, child, "child-match");
    await linkTag(container, childMatch, tag);
    // In parent but untagged — excluded by the tag filter.
    await seedNote(container, owner, parent, "parent-untagged");
    // In a sibling subtree, tagged — excluded by the directory filter.
    const siblingTagged = await seedNote(
      container,
      owner,
      sibling,
      "sibling-tagged",
    );
    await linkTag(container, siblingTagged, tag);

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        directoryId: parent as unknown as DirectoryId,
        tagIds: [tag],
      },
    });
    expect(new Set(notes.map((n) => n.id as string))).toEqual(
      new Set([parentMatch, childMatch]),
    );
    expect(count).toBe(2);
  });

  // Issue #392 ADR-002 — a non-existent `directoryId` resolves to an empty
  // subtree, which the adapter treats as "match nothing" (silent-empty).
  it("returns an empty listing for a non-existent directoryId", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    await seedNote(container, owner, root, "in-root");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 50,
        directoryId:
          "0193e7d0-ffff-7000-8000-0000000000ff" as unknown as DirectoryId,
      },
    });
    expect(notes).toHaveLength(0);
    expect(count).toBe(0);
  });

  // Issue #392 — large-subtree host-var fallback: when the resolved
  // subtree holds more than `SAFE_CHUNK_SIZE` (90) directories, the
  // adapter resolves the directory set to a note-id candidate set rather
  // than emitting an over-cap `IN (directory_id...)`. The owner has one
  // root, so build the wide subtree under a non-root `parent` (parent +
  // 95 children = 96 directories > SAFE_CHUNK_SIZE) and keep an unrelated
  // directory under the root to prove it stays excluded.
  it("filters correctly when the subtree exceeds the host-var chunk size", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const parent = await seedChildDirectory(container, owner, root);
    const CHILDREN = 95;
    const matchIds: string[] = [];
    matchIds.push(await seedNote(container, owner, parent, "in-parent"));
    for (let i = 0; i < CHILDREN; i += 1) {
      const child = await seedChildDirectory(container, owner, parent, 2);
      matchIds.push(await seedNote(container, owner, child, `in-child-${i}`));
    }
    // An unrelated directory under the same root must not surface.
    const outside = await seedChildDirectory(container, owner, root);
    await seedNote(container, owner, outside, "outside");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: 200,
        directoryId: parent as unknown as DirectoryId,
      },
    });
    expect(new Set(notes.map((n) => n.id as string))).toEqual(
      new Set(matchIds),
    );
    expect(count).toBe(matchIds.length);
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

  // Issue #392 — `directoryId` must ride the `count` query's WHERE clause,
  // not just the items query, across the whole subtree. With more subtree
  // notes than the page limit, the visible slice is capped at `limit`
  // while `count` must report the full subtree total. This pins the
  // runtime count>limit behaviour; the `NoteOwnerCountOpts` Pick that
  // carries `directoryIds` to the count path is guarded separately at the
  // type level (dropping it fails typecheck in the adapter's where
  // builder).
  it("returns count > limit reflecting the directory's whole subtree", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    // Select a non-root `parent` so a `sibling` under the same root can
    // hold notes outside the selected subtree.
    const root = await seedDirectory(container, owner);
    const parent = await seedChildDirectory(container, owner, root);
    const child = await seedChildDirectory(container, owner, parent, 2);
    const sibling = await seedChildDirectory(container, owner, root);
    const LIMIT = 2;
    // 3 in parent + 2 in the descendant child = 5 in the subtree.
    const SUBTREE_TOTAL = 5;
    for (let i = 0; i < 3; i += 1) {
      await seedNote(container, owner, parent, `parent-${i}`);
    }
    for (let i = 0; i < 2; i += 1) {
      await seedNote(container, owner, child, `child-${i}`);
    }
    // Notes outside the subtree must not inflate the count.
    await seedNote(container, owner, sibling, "in-sibling");

    const { notes, count } = await listNotesByOwner({
      container,
      input: {
        actorUserId: owner,
        page: 1,
        limit: LIMIT,
        directoryId: parent as unknown as DirectoryId,
      },
    });
    expect(notes).toHaveLength(LIMIT);
    expect(count).toBe(SUBTREE_TOTAL);
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
