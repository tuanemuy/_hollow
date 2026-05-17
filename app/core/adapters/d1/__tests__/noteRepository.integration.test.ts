import type { BatchItem } from "drizzle-orm/batch";
import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
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
        slug: `bulk-${id.slice(9, 13)}-${i}`,
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
    const publicSet = new Set(publicIds);
    for (const note of found) {
      expect(publicSet.has(note.id as NoteId)).toBe(false);
    }
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
  });

  // T-bind-003: covers the `loadChildren` chunk path. 150 notes each
  // carry one tag and one media ref; `limit=150` makes `hydrateMany`
  // load all children in one go and tip every child select past the
  // bind cap on the pre-#33 implementation. Children must be hydrated
  // without loss across the chunk boundary.
  it("T-bind-003: loadChildren hydrates tags and mediaRefs across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTag(container, owner, "bulk");
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
    await container.db.batch(
      tagStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );
    await container.db.batch(
      mediaStmts as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const found = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findByOwner(owner, { limit: 150, offset: 0 }),
    );
    expect(found).toHaveLength(150);
    for (const note of found) {
      expect(note.tagIds).toEqual([tag]);
      expect(note.mediaRefs).toEqual([mediaId]);
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
});
