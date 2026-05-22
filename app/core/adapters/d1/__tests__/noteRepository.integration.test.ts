import type { BatchItem } from "drizzle-orm/batch";
import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId, NoteSlug } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for the extended `D1NoteRepository.findByOwner` —
 * specifically the `visibility` and `referencingNoteId` filters added
 * by Issue #8. The existing `findByOwner` paths (tagIds, dateRange,
 * status) are exercised indirectly through usecase tests; here we focus
 * on the new filter axes and their interaction with the candidate-set
 * intersection logic.
 */

const NOW = new Date("2026-01-01T00:00:00.000Z");
const TZ = NOW.toISOString();

// Deterministic UUIDv7-shaped ids — the repositories validate the
// `^........-....-7...-[89ab]...-............$` shape on rehydration.
// The counter is module-scoped: each `createTestContainer` returns a
// fresh in-memory D1 so cross-test id reuse is harmless, but the
// monotonically-incrementing counter keeps ids globally unique even
// when vitest runs files in parallel.
let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const prefHex = prefix.toString(16).padStart(2, "0");
  return `0193e7d0-${block}-7000-8000-0000000000${prefHex}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Test User",
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username: `user-${id.slice(9, 13)}`,
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
  container: TestContainer,
  ownerId: UserId,
): Promise<string> {
  const id = nextId(0x02);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: null,
    name: "root",
    slug: `dir-${id.slice(9, 13)}`,
    depth: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: string,
  opts: Readonly<{
    title?: string;
    updatedAt?: string;
    status?: "active" | "trashed";
  }> = {},
): Promise<NoteId> {
  const id = nextId(0x03);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `note-${id.slice(9, 13)}`,
    title: opts.title ?? `Note ${id.slice(-4)}`,
    contentHtml: "<p>body</p>",
    frontMatterJson: "{}",
    status,
    trashedAt: status === "trashed" ? TZ : null,
    createdAt: TZ,
    updatedAt: opts.updatedAt ?? TZ,
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

async function seedTag(
  container: TestContainer,
  ownerId: UserId,
  name: string,
): Promise<TagId> {
  const id = nextId(0x04);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name.toLowerCase(),
    noteCount: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id as TagId;
}

async function tagNote(
  container: TestContainer,
  noteId: NoteId,
  tagId: TagId,
): Promise<void> {
  await container.db.insert(schema.noteTags).values({ noteId, tagId });
}

async function seedInternalLink(
  container: TestContainer,
  fromNoteId: NoteId,
  resolvedNoteId: NoteId,
): Promise<void> {
  const id = nextId(0x05);
  await container.db.insert(schema.noteInternalLinks).values({
    id,
    fromNoteId,
    refKind: "id",
    refTarget: resolvedNoteId,
    displayText: null,
    resolvedNoteId,
  });
}

describe("D1NoteRepository.findByOwner — visibility filter (integration)", () => {
  it("undefined visibility returns every note (baseline)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedNote(container, owner, dir, { title: "a" });
    const b = await seedNote(container, owner, dir, { title: "b" });
    await seedPublicationState(container, a, owner, "public");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, { limit: 50, offset: 0 }),
    );
    const ids = new Set(found.map((n) => n.id));
    expect(ids.has(a)).toBe(true);
    expect(ids.has(b)).toBe(true);
  });

  it("visibility=['public'] returns only public notes", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const pub = await seedNote(container, owner, dir, { title: "pub" });
    const unl = await seedNote(container, owner, dir, { title: "unl" });
    const priv = await seedNote(container, owner, dir, { title: "priv" });
    await seedPublicationState(container, pub, owner, "public");
    await seedPublicationState(container, unl, owner, "unlisted");
    await seedPublicationState(container, priv, owner, "private");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          visibility: ["public"],
        }),
    );
    expect(found.map((n) => n.id)).toEqual([pub]);
  });

  it("visibility=['private'] includes notes with no publication_states row", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const implicitPrivate = await seedNote(container, owner, dir, {
      title: "implicit",
    });
    const explicitPrivate = await seedNote(container, owner, dir, {
      title: "explicit",
    });
    const pub = await seedNote(container, owner, dir, { title: "pub" });
    await seedPublicationState(container, explicitPrivate, owner, "private");
    await seedPublicationState(container, pub, owner, "public");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          visibility: ["private"],
        }),
    );
    const ids = new Set(found.map((n) => n.id));
    expect(ids.has(implicitPrivate)).toBe(true);
    expect(ids.has(explicitPrivate)).toBe(true);
    expect(ids.has(pub)).toBe(false);
  });

  it("visibility=['public','unlisted'] returns the union of both", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const pub = await seedNote(container, owner, dir, { title: "pub" });
    const unl = await seedNote(container, owner, dir, { title: "unl" });
    const priv = await seedNote(container, owner, dir, { title: "priv" });
    await seedPublicationState(container, pub, owner, "public");
    await seedPublicationState(container, unl, owner, "unlisted");
    await seedPublicationState(container, priv, owner, "private");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          visibility: ["public", "unlisted"],
        }),
    );
    const ids = new Set(found.map((n) => n.id));
    expect(ids.has(pub)).toBe(true);
    expect(ids.has(unl)).toBe(true);
    expect(ids.has(priv)).toBe(false);
  });

  it("visibility=[] short-circuits to an empty result without touching DB", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "x" });

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          visibility: [],
        }),
    );
    expect(found).toEqual([]);
  });

  // T-W-001: passing every visibility takes the `wantsPrivate=true &&
  // notWanted.length===0` early-return path. The candidate set must equal
  // every owner-scoped active note without consulting publication_states
  // for exclusion.
  it("visibility=['private','unlisted','public'] returns every owner note", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const pub = await seedNote(container, owner, dir, { title: "pub" });
    const unl = await seedNote(container, owner, dir, { title: "unl" });
    const implicitPriv = await seedNote(container, owner, dir, {
      title: "implicit",
    });
    await seedPublicationState(container, pub, owner, "public");
    await seedPublicationState(container, unl, owner, "unlisted");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          visibility: ["private", "unlisted", "public"],
        }),
    );
    const ids = new Set(found.map((n) => n.id));
    expect(ids.has(pub)).toBe(true);
    expect(ids.has(unl)).toBe(true);
    expect(ids.has(implicitPriv)).toBe(true);
  });

  // T-W-002: owner-scope leak regression. Another owner's notes must
  // never bleed into the candidate set, even when their publication
  // visibility falls within the filter.
  it("does not leak notes belonging to other owners", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const other = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const otherDir = await seedDirectory(container, other);
    const mine = await seedNote(container, owner, dir, { title: "mine" });
    const theirs = await seedNote(container, other, otherDir, {
      title: "theirs",
    });
    await seedPublicationState(container, mine, owner, "public");
    await seedPublicationState(container, theirs, other, "public");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          visibility: ["public"],
        }),
    );
    const ids = found.map((n) => n.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  });

  // T-W-003: when the intersection of all candidate sets is empty the
  // adapter must short-circuit without issuing the main note select.
  it("returns [] when intersecting candidate sets becomes empty", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir, { title: "target" });
    // `target` is the only public note. It also references itself in no
    // way, so visibility=['public'] ∩ referencingNoteId=target = ∅.
    await seedPublicationState(container, target, owner, "public");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          visibility: ["public"],
          referencingNoteId: target,
        }),
    );
    expect(found).toEqual([]);
  });
});

describe("D1NoteRepository.findByOwner — status × visibility (integration)", () => {
  // I-W-003: trashed notes have publication_states rows too. Combining
  // visibility=['public'] with status='trashed' must intersect both
  // axes — only trashed notes whose publication is public should match.
  it("intersects status='trashed' with visibility=['public']", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const activePub = await seedNote(container, owner, dir, {
      title: "active-pub",
      status: "active",
    });
    const trashedPub = await seedNote(container, owner, dir, {
      title: "trashed-pub",
      status: "trashed",
    });
    const trashedPriv = await seedNote(container, owner, dir, {
      title: "trashed-priv",
      status: "trashed",
    });
    await seedPublicationState(container, activePub, owner, "public");
    await seedPublicationState(container, trashedPub, owner, "public");
    await seedPublicationState(container, trashedPriv, owner, "private");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          status: "trashed",
          visibility: ["public"],
        }),
    );
    expect(found.map((n) => n.id)).toEqual([trashedPub]);
  });

  // T-W-007: wantsPrivate=true sweep must honour status='trashed' so that
  // trashed private notes (including those with no publication_states row)
  // are returned while active notes are excluded.
  it("intersects status='trashed' with visibility=['private']", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const activePriv = await seedNote(container, owner, dir, {
      title: "active-priv",
      status: "active",
    });
    const trashedPrivExplicit = await seedNote(container, owner, dir, {
      title: "trashed-priv-explicit",
      status: "trashed",
    });
    const trashedPrivImplicit = await seedNote(container, owner, dir, {
      title: "trashed-priv-implicit",
      status: "trashed",
    });
    const trashedPublic = await seedNote(container, owner, dir, {
      title: "trashed-public",
      status: "trashed",
    });
    await seedPublicationState(container, activePriv, owner, "private");
    await seedPublicationState(
      container,
      trashedPrivExplicit,
      owner,
      "private",
    );
    // trashedPrivImplicit has no publication_states row (implicit private)
    await seedPublicationState(container, trashedPublic, owner, "public");

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          status: "trashed",
          visibility: ["private"],
        }),
    );
    const ids = new Set(found.map((n) => n.id));
    expect(ids.has(trashedPrivExplicit)).toBe(true);
    expect(ids.has(trashedPrivImplicit)).toBe(true);
    expect(ids.has(activePriv)).toBe(false);
    expect(ids.has(trashedPublic)).toBe(false);
    expect(found.length).toBe(2);
  });
});

describe("D1NoteRepository.findByOwner — referencingNoteId filter (integration)", () => {
  it("returns only notes whose internal links resolve to the target", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir, { title: "target" });
    const referrer = await seedNote(container, owner, dir, {
      title: "referrer",
    });
    const unrelated = await seedNote(container, owner, dir, {
      title: "unrelated",
    });
    await seedInternalLink(container, referrer, target);

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          referencingNoteId: target,
        }),
    );
    const ids = found.map((n) => n.id);
    expect(ids).toContain(referrer);
    expect(ids).not.toContain(unrelated);
    expect(ids).not.toContain(target);
  });

  it("returns [] when nothing references the target", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir, { title: "target" });
    await seedNote(container, owner, dir, { title: "other" });

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          referencingNoteId: target,
        }),
    );
    expect(found).toEqual([]);
  });
});

describe("D1NoteRepository.findByOwner — combined AND filters (integration)", () => {
  it("intersects visibility, tagIds, and referencingNoteId", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTag(container, owner, "draft");
    const target = await seedNote(container, owner, dir, { title: "target" });

    // matches every axis
    const winner = await seedNote(container, owner, dir, { title: "winner" });
    await seedPublicationState(container, winner, owner, "public");
    await tagNote(container, winner, tag);
    await seedInternalLink(container, winner, target);

    // matches every axis except tag
    const noTag = await seedNote(container, owner, dir, { title: "noTag" });
    await seedPublicationState(container, noTag, owner, "public");
    await seedInternalLink(container, noTag, target);

    // matches every axis except visibility
    const wrongVis = await seedNote(container, owner, dir, {
      title: "wrongVis",
    });
    await seedPublicationState(container, wrongVis, owner, "private");
    await tagNote(container, wrongVis, tag);
    await seedInternalLink(container, wrongVis, target);

    // matches every axis except referencing
    const noRef = await seedNote(container, owner, dir, { title: "noRef" });
    await seedPublicationState(container, noRef, owner, "public");
    await tagNote(container, noRef, tag);

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          visibility: ["public"],
          tagIds: [tag],
          referencingNoteId: target,
        }),
    );
    expect(found.map((n) => n.id)).toEqual([winner]);
  });
});

// Seed many notes via per-row `db.batch` statements. A multi-row
// `INSERT ... VALUES (...), (...), ...` would consume `cols * rows`
// host variables — for `notes` (15 columns) 50 rows is already 750
// binds, well past the D1 limit this Issue is closing. Per-statement
// batching keeps each insert under the cap regardless of `count`.
async function seedManyNotes(
  container: TestContainer,
  ownerId: UserId,
  directoryId: string,
  count: number,
  opts: Readonly<{
    updatedAtBase?: Date;
    status?: "active" | "trashed";
  }> = {},
): Promise<readonly NoteId[]> {
  const base = opts.updatedAtBase ?? NOW;
  const status = opts.status ?? "active";
  const ids: NoteId[] = [];
  const stmts: BatchItem<"sqlite">[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = nextId(0x06) as NoteId;
    ids.push(id);
    const updatedAt = new Date(base.getTime() + i * 1000).toISOString();
    stmts.push(
      container.db.insert(schema.notes).values({
        id,
        ownerId,
        directoryId,
        slug: `bulk-${i}`,
        title: `Bulk ${i}`,
        contentHtml: "<p>body</p>",
        frontMatterJson: "{}",
        status,
        trashedAt: status === "trashed" ? TZ : null,
        createdAt: TZ,
        updatedAt,
        editLockUserId: null,
        editLockAcquiredAt: null,
        editLockExpiresAt: null,
        version: 0,
      }),
    );
  }
  if (stmts.length > 0) {
    await container.db.batch(
      stmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );
  }
  return ids;
}

describe("D1NoteRepository — D1 bind limit regression (integration)", () => {
  // T-bind-001: 150 active notes, 50 of them publicly published.
  // `visibility=['private']` exercises the `wantsPrivate=true` path,
  // which on the pre-#33 implementation feeds owner_count − public_count
  // = 100 ids into a single `inArray(notes.id, [...])` and trips the D1
  // host-variable cap. Post-fix this is a single `NOT EXISTS` correlated
  // subquery, so bind count is owner-independent.
  it("T-bind-001: visibility=['private'] over 150 owner notes returns implicit + explicit private", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const ids = await seedManyNotes(container, owner, dir, 150);
    // First 50 ids get an explicit `public` publication state.
    const publicIds = ids.slice(0, 50);
    const pubStmts = publicIds.map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 200,
          offset: 0,
          visibility: ["private"],
        }),
    );
    expect(found).toHaveLength(100);
    const expectedPrivateIds = new Set(ids.slice(50));
    expect(new Set(found.map((n) => n.id as NoteId))).toEqual(
      expectedPrivateIds,
    );
  });

  // T-bind-002: same seed, visibility covers all three values — the
  // `notWanted` set is empty so the new code path adds no predicate and
  // returns every owner note. On the pre-#33 implementation this still
  // takes the owner-sweep path and overflows the bind cap.
  it("T-bind-002: visibility=['private','public'] over 150 owner notes returns all 150", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const ids = await seedManyNotes(container, owner, dir, 150);
    const publicIds = ids.slice(0, 50);
    const pubStmts = publicIds.map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 200,
          offset: 0,
          visibility: ["private", "public"],
        }),
    );
    expect(found).toHaveLength(150);
    expect(new Set(found.map((n) => n.id as NoteId))).toEqual(new Set(ids));
  });

  // T-bind-003: covers the `loadChildren` chunk path. 150 notes each
  // carry one tag, one media ref, and one internal link; `limit=150`
  // makes `hydrateMany` load all children in one go and tip every child
  // select past the bind cap on the pre-#33 implementation. Children
  // must be hydrated without loss across the chunk boundary.
  it("T-bind-003: loadChildren hydrates tags, internalLinks, and mediaRefs across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTag(container, owner, "bulk");
    // Anchor note that every bulk-seeded note will internal-link to.
    const linkTarget = await seedNote(container, owner, dir, {
      title: "link-target",
    });
    const noteIds = await seedManyNotes(container, owner, dir, 150);
    const mediaId = nextId(0x07);
    // media_assets parent row required by FK declared in raw SQL.
    await container.db.insert(schema.mediaAssets).values({
      id: mediaId,
      ownerId: owner,
      kind: "image",
      mimeType: "image/png",
      byteSize: 1,
      backend: "r2",
      storageKey: `bulk/${mediaId}`,
      originalFileName: "x.png",
      width: null,
      height: null,
      durationMs: null,
      refCount: 1,
      status: "attached",
      createdAt: TZ,
      updatedAt: TZ,
    });
    const tagStmts = noteIds.map((noteId) =>
      container.db.insert(schema.noteTags).values({ noteId, tagId: tag }),
    );
    const mediaStmts = noteIds.map((noteId) =>
      container.db.insert(schema.noteMediaRefs).values({ noteId, mediaId }),
    );
    const linkStmts = noteIds.map((fromId) =>
      container.db.insert(schema.noteInternalLinks).values({
        id: nextId(0x09),
        fromNoteId: fromId,
        refKind: "id",
        refTarget: linkTarget,
        displayText: null,
        resolvedNoteId: linkTarget,
      }),
    );
    await container.db.batch(
      tagStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );
    await container.db.batch(
      mediaStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );
    await container.db.batch(
      linkStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, { limit: 150, offset: 0 }),
    );
    expect(found).toHaveLength(150);
    const bulkSet = new Set(noteIds);
    for (const note of found) {
      if (!bulkSet.has(note.id as NoteId)) continue; // skip linkTarget
      expect(note.tagIds).toEqual([tag]);
      expect(note.mediaRefs).toEqual([mediaId]);
      expect(note.internalLinkRefs).toHaveLength(1);
      expect(note.internalLinkRefs[0]?.resolvedNoteId).toBe(linkTarget);
    }
  });

  // T-bind-004: `findReferrers` chunk path. 150 distinct notes each
  // link to the same target; chunked-and-rejoined rows must be sorted
  // by `(updatedAt DESC, id DESC)` to match the pre-chunk SQL order.
  it("T-bind-004: findReferrers returns 150 referrers in updatedAt DESC, id DESC order across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir, { title: "target" });
    const referrerIds = await seedManyNotes(container, owner, dir, 150);
    const linkStmts = referrerIds.map((fromId) => {
      const linkId = nextId(0x08);
      return container.db.insert(schema.noteInternalLinks).values({
        id: linkId,
        fromNoteId: fromId,
        refKind: "id",
        refTarget: target,
        displayText: null,
        resolvedNoteId: target,
      });
    });
    await container.db.batch(
      linkStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findReferrers(target),
    );
    expect(found).toHaveLength(150);
    const foundIds = found.map((n) => n.id);
    // Expected order: updatedAt DESC, id DESC. `seedManyNotes` assigns
    // each row updatedAt = base + i s and a strictly increasing id, so
    // descending updatedAt is equivalent to descending insertion order.
    const expected = [...referrerIds].reverse();
    expect(foundIds).toEqual(expected);
  });

  // T-bind-005: tie-break when several referrers share the same
  // `updatedAt` millisecond — the JS sort must fall back to descending
  // id, mirroring the pre-chunk SQL `desc(updatedAt), desc(id)` clause.
  it("T-bind-005: findReferrers tie-breaks equal updatedAt by descending id", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir, { title: "target" });
    // Seed 5 referrers sharing one `updatedAt`, then 5 more sharing a
    // later one — straddles the JS sort's primary and secondary keys.
    const earlyTs = "2026-02-01T00:00:00.000Z";
    const lateTs = "2026-02-02T00:00:00.000Z";
    const earlyIds: NoteId[] = [];
    const lateIds: NoteId[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = nextId(0x06) as NoteId;
      earlyIds.push(id);
      await container.db.insert(schema.notes).values({
        id,
        ownerId: owner,
        directoryId: dir,
        slug: `tie-early-${i}`,
        title: `Early ${i}`,
        contentHtml: "<p>body</p>",
        frontMatterJson: "{}",
        status: "active",
        trashedAt: null,
        createdAt: TZ,
        updatedAt: earlyTs,
        editLockUserId: null,
        editLockAcquiredAt: null,
        editLockExpiresAt: null,
        version: 0,
      });
    }
    for (let i = 0; i < 5; i += 1) {
      const id = nextId(0x06) as NoteId;
      lateIds.push(id);
      await container.db.insert(schema.notes).values({
        id,
        ownerId: owner,
        directoryId: dir,
        slug: `tie-late-${i}`,
        title: `Late ${i}`,
        contentHtml: "<p>body</p>",
        frontMatterJson: "{}",
        status: "active",
        trashedAt: null,
        createdAt: TZ,
        updatedAt: lateTs,
        editLockUserId: null,
        editLockAcquiredAt: null,
        editLockExpiresAt: null,
        version: 0,
      });
    }
    const allIds = [...earlyIds, ...lateIds];
    const linkStmts = allIds.map((fromId) =>
      container.db.insert(schema.noteInternalLinks).values({
        id: nextId(0x08),
        fromNoteId: fromId,
        refKind: "id",
        refTarget: target,
        displayText: null,
        resolvedNoteId: target,
      }),
    );
    await container.db.batch(
      linkStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findReferrers(target),
    );
    const foundIds = found.map((n) => n.id);
    const expected = [
      ...[...lateIds].sort().reverse(),
      ...[...earlyIds].sort().reverse(),
    ];
    expect(foundIds).toEqual(expected);
  });

  // T-bind-006: regression on the chunk-fold seam — 120 referrers
  // straddle `SAFE_CHUNK_SIZE=90`, half share one `updatedAt` and the
  // rest share another. Verifies that JS sort after `Promise.all`
  // concat still applies the `(updatedAt DESC, id DESC)` ordering
  // across multiple chunks.
  it("T-bind-006: findReferrers preserves (updatedAt DESC, id DESC) across the chunk boundary with ties", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir, { title: "target" });
    const earlyTs = "2026-03-01T00:00:00.000Z";
    const lateTs = "2026-03-02T00:00:00.000Z";
    const earlyIds: NoteId[] = [];
    const lateIds: NoteId[] = [];
    for (let i = 0; i < 60; i += 1) {
      const id = nextId(0x06) as NoteId;
      lateIds.push(id);
      await container.db.insert(schema.notes).values({
        id,
        ownerId: owner,
        directoryId: dir,
        slug: `seam-late-${i}`,
        title: `Late ${i}`,
        contentHtml: "<p>body</p>",
        frontMatterJson: "{}",
        status: "active",
        trashedAt: null,
        createdAt: TZ,
        updatedAt: lateTs,
        editLockUserId: null,
        editLockAcquiredAt: null,
        editLockExpiresAt: null,
        version: 0,
      });
    }
    for (let i = 0; i < 60; i += 1) {
      const id = nextId(0x06) as NoteId;
      earlyIds.push(id);
      await container.db.insert(schema.notes).values({
        id,
        ownerId: owner,
        directoryId: dir,
        slug: `seam-early-${i}`,
        title: `Early ${i}`,
        contentHtml: "<p>body</p>",
        frontMatterJson: "{}",
        status: "active",
        trashedAt: null,
        createdAt: TZ,
        updatedAt: earlyTs,
        editLockUserId: null,
        editLockAcquiredAt: null,
        editLockExpiresAt: null,
        version: 0,
      });
    }
    const linkStmts = [...lateIds, ...earlyIds].map((fromId) =>
      container.db.insert(schema.noteInternalLinks).values({
        id: nextId(0x08),
        fromNoteId: fromId,
        refKind: "id",
        refTarget: target,
        displayText: null,
        resolvedNoteId: target,
      }),
    );
    await container.db.batch(
      linkStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findReferrers(target),
    );
    const foundIds = found.map((n) => n.id);
    const expected = [
      ...[...lateIds].sort().reverse(),
      ...[...earlyIds].sort().reverse(),
    ];
    expect(foundIds).toEqual(expected);
  });

  // T-bind-007 (Issue #45): `resolveTagAndCandidates` is private and
  // reached via `findByOwner({ tagIds: [...] })`. A 150-tag input feeds
  // `inArray(noteTags.tagId, [...])` past the D1 host-variable cap on
  // the pre-#45 implementation. Post-fix the helper chunks the lookup
  // and the JS-side `Map<noteId, Set<tagId>>` aggregator folds tag rows
  // across chunk boundaries (single `noteId` with tag rows split across
  // chunks still passes the `seen.size === tagIds.length` filter).
  it("T-bind-007: findByOwner({ tagIds: [...150] }) AND-matches a single note across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const note = await seedNote(container, owner, dir, { title: "all-tags" });

    const tagIds: TagId[] = [];
    const tagStmts: BatchItem<"sqlite">[] = [];
    for (let i = 0; i < 150; i += 1) {
      const tagId = nextId(0x04) as TagId;
      tagIds.push(tagId);
      tagStmts.push(
        container.db.insert(schema.tags).values({
          id: tagId,
          ownerId: owner,
          name: `bulk-tag-${i}`,
          nameNormalized: `bulk-tag-${i}`,
          noteCount: 1,
          version: 0,
          createdAt: TZ,
          updatedAt: TZ,
        }),
      );
    }
    await container.db.batch(
      tagStmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const noteTagStmts = tagIds.map((tagId) =>
      container.db.insert(schema.noteTags).values({ noteId: note, tagId }),
    );
    await container.db.batch(
      noteTagStmts as unknown as [
        BatchItem<"sqlite">,
        ...BatchItem<"sqlite">[],
      ],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          tagIds,
        }),
    );
    expect(found.map((n) => n.id as NoteId)).toEqual([note]);
  });

  // T-bind-008..011 (Issue #165): exercise the new `findByOwner` /
  // `countByOwner` chunk path that activates when `buildOwnerListWhere`
  // returns a non-null `idScope`. The pre-#165 implementation embedded
  // `inArray(notes.id, [...intersected])` inside the main query, which
  // tripped the D1 host-var cap once the intersection grew past ~90
  // ids. Post-fix the IN predicate moves to `selectInChunks` and the
  // listing's sort/limit are re-applied in JS.

  // T-bind-008: 150 public notes; `visibility=['public']` yields an
  // intersected scope of 150 ids. `findByOwner` must chunk the lookup
  // and return every row.
  it("T-bind-008: findByOwner({ visibility: ['public'] }) returns 150 across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const ids = await seedManyNotes(container, owner, dir, 150);
    const pubStmts = ids.map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 200,
          offset: 0,
          visibility: ["public"],
        }),
    );
    expect(found).toHaveLength(150);
    expect(new Set(found.map((n) => n.id as NoteId))).toEqual(new Set(ids));
  });

  // T-bind-009: 150 public notes with strictly increasing `updatedAt`;
  // `visibility=['public']` activates the chunk path, and the JS-side
  // re-sort must match a single-query DB-side `ORDER BY updatedAt
  // DESC, id DESC LIMIT 50 OFFSET 50`. `seedManyNotes` assigns
  // `updatedAt = base + i*1000ms` so positions are deterministic.
  it("T-bind-009: findByOwner({ visibility: ['public'], offset: 50, limit: 50, sort: updatedAt desc }) matches DB-side ordering", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const publicIds = await seedManyNotes(container, owner, dir, 150);
    const pubStmts = publicIds.map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 50,
          sort: "updatedAt",
          order: "desc",
          visibility: ["public"],
        }),
    );
    // Public ids were seeded in index order with monotonically
    // increasing updatedAt. After `(updatedAt DESC, id DESC)` the page
    // at offset=50 limit=50 contains indices 99..50 (descending).
    const expected = [...publicIds].reverse().slice(50, 100);
    expect(found.map((n) => n.id as NoteId)).toEqual(expected);
  });

  // T-bind-010: two candidate sets (visibility + tagIds) both expand
  // to the same 150 ids. The intersection is still 150, so the chunk
  // path runs. Confirms that multi-axis filter mixes feed the same
  // code path.
  it("T-bind-010: findByOwner({ tagIds, visibility: ['public'] }) intersects two 150-id sets across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTag(container, owner, "bulk-public");
    const ids = await seedManyNotes(container, owner, dir, 150);
    const pubStmts = ids.map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    const tagStmts = ids.map((noteId) =>
      container.db.insert(schema.noteTags).values({ noteId, tagId: tag }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );
    await container.db.batch(
      tagStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 200,
          offset: 0,
          tagIds: [tag],
          visibility: ["public"],
        }),
    );
    expect(found).toHaveLength(150);
    expect(new Set(found.map((n) => n.id as NoteId))).toEqual(new Set(ids));
  });

  // T-bind-011: `countByOwner` must agree with `findByOwner` under
  // the same filter. 150 public notes intersected with public
  // visibility → count of 150. The chunked per-chunk `select id`
  // sums correctly across chunk boundaries.
  it("T-bind-011: countByOwner({ visibility: ['public'] }) returns 150 across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const ids = await seedManyNotes(container, owner, dir, 150);
    const pubStmts = ids.map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const count = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.countByOwner(owner, { visibility: ["public"] }),
    );
    expect(count).toBe(150);
    // list/count cross-check: under the same filter, the page that
    // covers every candidate must match `count` in cardinality so the
    // chunk-summed count and chunk-folded list can't drift apart.
    const listed = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 1000,
          offset: 0,
          visibility: ["public"],
        }),
    );
    expect(listed).toHaveLength(count);
  });

  // T-bind-012: `sort='title'` chunk path. The JS `sortNoteRowsBy`
  // helper must match a single-query DB-side `ORDER BY title ASC, id
  // DESC`. `seedManyNotes` assigns titles `Bulk 0..149` (ASCII only),
  // so SQLite's BINARY collation and JS string compare agree, but the
  // resulting order is lexicographic — `Bulk 10` precedes `Bulk 2`.
  it("T-bind-012: findByOwner({ visibility: ['public'], sort: 'title', order: 'asc' }) matches DB-side ordering", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const ids = await seedManyNotes(container, owner, dir, 150);
    const pubStmts = ids.map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 50,
          offset: 0,
          sort: "title",
          order: "asc",
          visibility: ["public"],
        }),
    );
    // Build the expected page by replicating the SQL ordering in JS:
    // primary `title ASC` (lexicographic over ASCII), tie-break `id
    // DESC`. Titles are unique here so the tie-break never fires.
    const byIndex = new Map<NoteId, number>();
    for (let i = 0; i < ids.length; i += 1) {
      byIndex.set(ids[i], i);
    }
    const expected = [...ids]
      .sort((a, b) => {
        const ta = `Bulk ${byIndex.get(a)}`;
        const tb = `Bulk ${byIndex.get(b)}`;
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return a < b ? 1 : a > b ? -1 : 0;
      })
      .slice(0, 50);
    expect(found.map((n) => n.id as NoteId)).toEqual(expected);
  });

  // T-bind-013: chunk-fold seam regression for the `findByOwner` chunk
  // path — 60 + 60 = 120 notes straddle `SAFE_CHUNK_SIZE=90`, half
  // share one `updatedAt` and the rest share another. Verifies the
  // JS-side `(updatedAt DESC, id DESC)` re-sort survives the chunk
  // boundary with ties (sibling test of T-bind-006 for `findReferrers`).
  it("T-bind-013: findByOwner preserves (updatedAt DESC, id DESC) across the chunk boundary with ties", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const earlyTs = "2026-03-01T00:00:00.000Z";
    const lateTs = "2026-03-02T00:00:00.000Z";
    const earlyIds: NoteId[] = [];
    const lateIds: NoteId[] = [];
    const noteStmts: BatchItem<"sqlite">[] = [];
    for (let i = 0; i < 60; i += 1) {
      const id = nextId(0x06) as NoteId;
      lateIds.push(id);
      noteStmts.push(
        container.db.insert(schema.notes).values({
          id,
          ownerId: owner,
          directoryId: dir,
          slug: `seam-late-${i}`,
          title: `Late ${i}`,
          contentHtml: "<p>body</p>",
          frontMatterJson: "{}",
          status: "active",
          trashedAt: null,
          createdAt: TZ,
          updatedAt: lateTs,
          editLockUserId: null,
          editLockAcquiredAt: null,
          editLockExpiresAt: null,
          version: 0,
        }),
      );
    }
    for (let i = 0; i < 60; i += 1) {
      const id = nextId(0x06) as NoteId;
      earlyIds.push(id);
      noteStmts.push(
        container.db.insert(schema.notes).values({
          id,
          ownerId: owner,
          directoryId: dir,
          slug: `seam-early-${i}`,
          title: `Early ${i}`,
          contentHtml: "<p>body</p>",
          frontMatterJson: "{}",
          status: "active",
          trashedAt: null,
          createdAt: TZ,
          updatedAt: earlyTs,
          editLockUserId: null,
          editLockAcquiredAt: null,
          editLockExpiresAt: null,
          version: 0,
        }),
      );
    }
    await container.db.batch(
      noteStmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );
    const pubStmts = [...lateIds, ...earlyIds].map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 120,
          offset: 0,
          sort: "updatedAt",
          order: "desc",
          visibility: ["public"],
        }),
    );
    const foundIds = found.map((n) => n.id as NoteId);
    const expected = [
      ...[...lateIds].sort().reverse(),
      ...[...earlyIds].sort().reverse(),
    ];
    expect(foundIds).toEqual(expected);
  });

  // T-bind-014: `intersected.size === 0` short-circuit. A tagId that
  // exists nowhere produces an empty candidate set, so
  // `buildOwnerListWhere` returns `null` and both `findByOwner` and
  // `countByOwner` skip the DB entirely. The tagId is a valid UUIDv7
  // shape so transport-boundary validation can't intercept it.
  it("T-bind-014: findByOwner / countByOwner short-circuit on empty intersected scope", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "exists" });
    const ghostTag = nextId(0x05) as TagId;

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, {
          limit: 100,
          offset: 0,
          tagIds: [ghostTag],
          visibility: ["public"],
        }),
    );
    expect(found).toEqual([]);

    const count = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.countByOwner(owner, {
          tagIds: [ghostTag],
          visibility: ["public"],
        }),
    );
    expect(count).toBe(0);
  });
});

describe("D1PublicationStateRepository.findByNoteIds (integration)", () => {
  // I-W-004: bulk lookup contract — empty input short-circuits, missing
  // ids drop silently so the caller's `'private'` fallback is the single
  // semantic source for "row absent".
  it("returns [] for an empty id list without querying", async () => {
    const container = createTestContainer();
    const result = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.findByNoteIds([]),
    );
    expect(result).toEqual([]);
  });

  it("omits ids that have no publication_states row", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const hasRow = await seedNote(container, owner, dir, { title: "has" });
    const noRow = await seedNote(container, owner, dir, { title: "miss" });
    await seedPublicationState(container, hasRow, owner, "public");

    const result = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.findByNoteIds([hasRow, noRow]),
    );
    const ids = result.map((s) => s.noteId);
    expect(ids).toContain(hasRow);
    expect(ids).not.toContain(noRow);
    expect(result).toHaveLength(1);
  });

  // T-bind-001 (Issue #45): 150 note ids feed `inArray(publicationStates.noteId, [...])`
  // past the D1 host-variable cap on the pre-#45 implementation. Post-fix
  // `selectInChunks` splits the lookup and concatenates rows across chunks.
  it("T-bind-001: findByNoteIds returns all 150 rows across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteIds = await seedManyNotes(container, owner, dir, 150);
    const pubStmts = noteIds.map((noteId) =>
      container.db.insert(schema.publicationStates).values({
        noteId,
        ownerId: owner,
        visibility: "public",
        publishedAt: TZ,
        updatedAt: TZ,
        version: 0,
      }),
    );
    await container.db.batch(
      pubStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const result = await container.unitOfWorkProvider.run(
      async ({ publicationStateRepository }) =>
        publicationStateRepository.findByNoteIds(noteIds),
    );
    expect(result).toHaveLength(150);
    expect(new Set(result.map((s) => s.noteId))).toEqual(new Set(noteIds));
  });
});

describe("D1NoteRepository.searchByTitlePrefix (integration)", () => {
  it("returns the owner's active notes matching the prefix, case-insensitively, ordered by title", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "Alpha" });
    await seedNote(container, owner, dir, { title: "alphabet" });
    await seedNote(container, owner, dir, { title: "Beta" });

    const rows = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.searchByTitlePrefix(owner, "ALPH", 10),
    );
    expect(rows.map((n) => n.title)).toEqual(["Alpha", "alphabet"]);
  });

  it("isolates owners — does not return another user's matching note", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const ownerDir = await seedDirectory(container, owner);
    const strangerDir = await seedDirectory(container, stranger);
    await seedNote(container, owner, ownerDir, { title: "Shared" });
    await seedNote(container, stranger, strangerDir, { title: "Shared" });

    const rows = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.searchByTitlePrefix(owner, "Shared", 10),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].ownerId).toBe(owner);
  });

  it("excludes trashed notes", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "live one" });
    await seedNote(container, owner, dir, {
      title: "live two",
      status: "trashed",
    });

    const rows = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.searchByTitlePrefix(owner, "live", 10),
    );
    expect(rows.map((n) => n.title)).toEqual(["live one"]);
  });

  it("escapes LIKE wildcards `%` and `_` so they match literally (ESCAPE clause works)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "50% off" });
    await seedNote(container, owner, dir, { title: "50abc off" });
    await seedNote(container, owner, dir, { title: "foo_bar" });
    await seedNote(container, owner, dir, { title: "fooxbar" });

    const pct = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.searchByTitlePrefix(owner, "50%", 10),
    );
    expect(pct.map((n) => n.title)).toEqual(["50% off"]);

    const underscore = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.searchByTitlePrefix(owner, "foo_", 10),
    );
    expect(underscore.map((n) => n.title)).toEqual(["foo_bar"]);
  });

  it("returns [] when limit <= 0 without touching the DB result shape", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "anything" });

    const rows = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.searchByTitlePrefix(owner, "any", 0),
    );
    expect(rows).toEqual([]);
  });

  it("returns [] for an empty / whitespace-only prefix", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "anything" });

    const rows = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.searchByTitlePrefix(owner, "   ", 10),
    );
    expect(rows).toEqual([]);
  });
});

// Pins Issue #42 / ADR-007: `findByOwnerAndSlug` is narrowed to
// `status='active'` so a trashed note cannot be resolved by slug. If
// the WHERE clause is ever loosened, `restoreNote`'s `assertSlugUnique`
// guard would silently return the self-row and the SlugConflict path
// would stop firing.
describe("D1NoteRepository.findByOwnerAndSlug — active-only filter (integration)", () => {
  async function insertNoteWithSlug(
    container: TestContainer,
    ownerId: UserId,
    directoryId: string,
    slug: string,
    status: "active" | "trashed",
  ): Promise<NoteId> {
    const id = nextId(0x07);
    await container.db.insert(schema.notes).values({
      id,
      ownerId,
      directoryId,
      slug,
      title: `t-${slug}`,
      contentHtml: "<p>body</p>",
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

  it("returns null when the only note with that slug is trashed", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await insertNoteWithSlug(container, owner, dir, "shared", "trashed");

    const hit = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwnerAndSlug(owner, "shared" as NoteSlug),
    );
    expect(hit).toBeNull();
  });

  it("returns the active row when an active and a trashed note share the same slug", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await insertNoteWithSlug(container, owner, dir, "shared", "trashed");
    const activeId = await insertNoteWithSlug(
      container,
      owner,
      dir,
      "shared",
      "active",
    );

    const hit = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwnerAndSlug(owner, "shared" as NoteSlug),
    );
    expect(hit?.id).toBe(activeId);
    expect(hit?.status).toBe("active");
  });
});

describe("D1NoteRepository.findByIds (integration)", () => {
  it("returns [] for an empty id list without touching the DB", async () => {
    const container = createTestContainer();
    // No seed at all — if the adapter dispatched a query against the
    // empty bind list it would either throw or hit an unprepared
    // schema; landing on [] is the contract.
    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findByIds([]),
    );
    expect(found).toEqual([]);
  });

  it("returns full Note aggregates for known ids, hydrating child tables", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTag(container, owner, "alpha");

    const a = await seedNote(container, owner, dir, { title: "a" });
    const b = await seedNote(container, owner, dir, { title: "b" });
    const c = await seedNote(container, owner, dir, { title: "c" });
    await tagNote(container, a, tag);
    await seedInternalLink(container, b, c);

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findByIds([a, b, c]),
    );

    expect(found).toHaveLength(3);
    // Order is not guaranteed; compare as a set.
    const byId = new Map(found.map((n) => [n.id as NoteId, n]));
    expect(byId.get(a)?.tagIds).toEqual([tag]);
    expect(byId.get(b)?.internalLinkRefs).toHaveLength(1);
    expect(byId.get(b)?.internalLinkRefs[0]?.resolvedNoteId).toBe(c);
    expect(byId.get(c)?.tagIds).toEqual([]);
  });

  it("partial-results: unknown ids are silently absent (no throw)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedNote(container, owner, dir, { title: "a" });
    const b = await seedNote(container, owner, dir, { title: "b" });
    const unknown = nextId(0x06) as NoteId;

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findByIds([a, unknown, b]),
    );
    const ids = new Set(found.map((n) => n.id as NoteId));
    expect(ids.has(a)).toBe(true);
    expect(ids.has(b)).toBe(true);
    expect(ids.has(unknown)).toBe(false);
  });

  // 90 = SAFE_CHUNK_SIZE exactly (single chunk), 91 = first id past
  // the boundary (1 full + 1 partial), 181 = two full chunks + 1
  // partial. Covers boundary-equal, boundary-+1, and multi-full-chunk
  // dispatch in the adapter.
  it.each([
    90, 91, 181,
  ])("handles %i ids across the SAFE_CHUNK_SIZE boundary", async (count) => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const ids = await seedManyNotes(container, owner, dir, count);

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findByIds(ids),
    );
    expect(found).toHaveLength(count);
    expect(new Set(found.map((n) => n.id as NoteId))).toEqual(new Set(ids));
  });
});
