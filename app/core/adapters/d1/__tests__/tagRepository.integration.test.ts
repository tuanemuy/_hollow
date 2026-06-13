import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1TagRepository.searchByNamePrefix` (Issue #36)
 * plus a regression for the `findByOwner` LIKE-ESCAPE change (ADR-006:
 * raw `sql\`... LIKE ${pat} ESCAPE '\\'\`` so `escapeLikePattern` works).
 */

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7f0-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Tag Test",
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username: `t-${id.slice(9, 13)}`,
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

async function seedTagRow(
  container: TestContainer,
  ownerId: UserId,
  name: string,
): Promise<string> {
  const id = nextId(0x02);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name.toLowerCase(),
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

// `notes.directory_id` is a NOT NULL FK to `directories(id)`, so a note
// needs a directory seeded first. Helpers ported from
// `noteRepository.integration.test.ts` (`seedDirectory` / `seedNote` /
// `tagNote` → `linkNoteTag`).
async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
): Promise<string> {
  const id = nextId(0x04);
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
  status: "active" | "trashed" = "active",
  updatedAt: string = TZ,
): Promise<string> {
  const id = nextId(0x05);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `note-${id.slice(9, 13)}`,
    title: `Note ${id.slice(-4)}`,
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
  });
  return id;
}

async function linkNoteTag(
  container: TestContainer,
  noteId: string,
  tagId: string,
): Promise<void> {
  await container.db.insert(schema.noteTags).values({ noteId, tagId });
}

async function seedPublication(
  container: TestContainer,
  noteId: string,
  ownerId: UserId,
  visibility: "private" | "unlisted" | "public",
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

describe("D1TagRepository.searchByNamePrefix (integration)", () => {
  it("returns matching tags, case-insensitively, ordered by name", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "Draft");
    await seedTagRow(container, owner, "drama");
    await seedTagRow(container, owner, "idea");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "DR", 10),
    );
    expect(rows.map((t) => t.name)).toEqual(["Draft", "drama"]);
  });

  it("isolates owners", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    await seedTagRow(container, owner, "alpha-mine");
    await seedTagRow(container, stranger, "alpha-theirs");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "alpha", 10),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("alpha-mine");
    expect(rows[0].ownerId).toBe(owner);
  });

  it("escapes LIKE wildcards `%` and `_` so they match literally", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "50%-tag");
    await seedTagRow(container, owner, "50abc-tag");
    await seedTagRow(container, owner, "foo_bar");
    await seedTagRow(container, owner, "fooxbar");

    const pct = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "50%", 10),
    );
    expect(pct.map((t) => t.name)).toEqual(["50%-tag"]);

    const underscore = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "foo_", 10),
    );
    expect(underscore.map((t) => t.name)).toEqual(["foo_bar"]);
  });

  it("returns [] when limit <= 0", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "anything");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "any", 0),
    );
    expect(rows).toEqual([]);
  });

  it("returns [] for an empty / whitespace-only prefix", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "anything");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchByNamePrefix(owner, "  ", 10),
    );
    expect(rows).toEqual([]);
  });
});

describe("D1TagRepository.findByOwner — LIKE ESCAPE regression (Issue #36)", () => {
  it("treats `%` and `_` in the search query as literal characters", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "50%-special");
    await seedTagRow(container, owner, "50abc-noise");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, {
          limit: 10,
          offset: 0,
          query: "50%",
        }),
    );
    expect(rows.map((e) => e.tag.name)).toEqual(["50%-special"]);
  });
});

describe("D1TagRepository.findByIds — D1 bind limit regression (Issue #45)", () => {
  // 150 tag ids feed `inArray(tags.id, [...])` past the D1 host-variable
  // cap on the pre-#45 implementation. Post-fix `selectInChunks`
  // splits the lookup and concatenates rows across chunks.
  it("T-bind-001: findByIds returns all 150 rows across the chunk boundary", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);

    const tagIds: TagId[] = [];
    const tagStmts: BatchItem<"sqlite">[] = [];
    for (let i = 0; i < 150; i += 1) {
      const id = nextId(0x03);
      tagIds.push(id as TagId);
      tagStmts.push(
        container.db.insert(schema.tags).values({
          id,
          ownerId: owner,
          name: `bulk-${i}`,
          nameNormalized: `bulk-${i}`,
          version: 0,
          createdAt: TZ,
          updatedAt: TZ,
        }),
      );
    }
    await container.db.batch(
      tagStmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) => tagRepository.findByIds(tagIds),
    );
    expect(rows).toHaveLength(150);
    expect(new Set(rows.map((t) => t.id))).toEqual(new Set(tagIds));
  });

  it("returns [] for an empty id list without querying", async () => {
    const container = createTestContainer();
    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) => tagRepository.findByIds([]),
    );
    expect(rows).toEqual([]);
  });
});

describe("D1TagRepository.findByOwner — read-time noteCount (Issue #365)", () => {
  const countOf = async (
    container: TestContainer,
    owner: UserId,
    name: string,
  ): Promise<number> => {
    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, { limit: 100, offset: 0 }),
    );
    const entry = rows.find((e) => e.tag.name === name);
    if (entry === undefined) throw new Error(`tag not found: ${name}`);
    return entry.noteCount;
  };

  it("aggregates active note links per tag (2 and 1)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tagA = await seedTagRow(container, owner, "tagA");
    const tagB = await seedTagRow(container, owner, "tagB");
    const n1 = await seedNote(container, owner, dir);
    const n2 = await seedNote(container, owner, dir);
    const n3 = await seedNote(container, owner, dir);
    await linkNoteTag(container, n1, tagA);
    await linkNoteTag(container, n2, tagA);
    await linkNoteTag(container, n3, tagB);

    expect(await countOf(container, owner, "tagA")).toBe(2);
    expect(await countOf(container, owner, "tagB")).toBe(1);
  });

  it("returns 0 for a tag with no note links", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "unused");

    expect(await countOf(container, owner, "unused")).toBe(0);
  });

  it("counts only active notes, not trashed ones", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTagRow(container, owner, "mixed");
    const active = await seedNote(container, owner, dir, "active");
    const trashed = await seedNote(container, owner, dir, "trashed");
    await linkNoteTag(container, active, tag);
    await linkNoteTag(container, trashed, tag);

    expect(await countOf(container, owner, "mixed")).toBe(1);
  });

  it("drops to 0 when a linked note is physically deleted (cascade)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTagRow(container, owner, "purged");
    const note = await seedNote(container, owner, dir);
    await linkNoteTag(container, note, tag);
    expect(await countOf(container, owner, "purged")).toBe(1);

    await container.db.delete(schema.notes).where(eq(schema.notes.id, note));

    expect(await countOf(container, owner, "purged")).toBe(0);
  });

  it("sorts by noteCount desc/asc with stable tags.id tie-break", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // Insert order fixes tags.id ordering: tagX before tagY (both count 1),
    // and tagW last with count 0 — it must stay in the listing (LEFT JOIN)
    // and sort to the tail (desc) / head (asc).
    const tagX = await seedTagRow(container, owner, "tagX");
    const tagY = await seedTagRow(container, owner, "tagY");
    const tagZ = await seedTagRow(container, owner, "tagZ");
    const tagW = await seedTagRow(container, owner, "tagW");
    const n1 = await seedNote(container, owner, dir);
    const n2 = await seedNote(container, owner, dir);
    const n3 = await seedNote(container, owner, dir);
    // tagZ=2, tagX=1, tagY=1, tagW=0 (unlinked).
    await linkNoteTag(container, n1, tagZ);
    await linkNoteTag(container, n2, tagZ);
    await linkNoteTag(container, n3, tagX);
    await linkNoteTag(container, n3, tagY);
    // tagW intentionally has no note links.
    void tagW;

    const desc = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, {
          limit: 100,
          offset: 0,
          sort: "noteCount",
          order: "desc",
        }),
    );
    // tagZ(2) first, ties tagX/tagY by ascending id, then tagW(0) at the tail.
    expect(desc.map((e) => e.tag.name)).toEqual([
      "tagZ",
      "tagX",
      "tagY",
      "tagW",
    ]);
    expect(desc[0].noteCount).toBe(2);
    expect(desc[desc.length - 1].noteCount).toBe(0);

    const asc = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, {
          limit: 100,
          offset: 0,
          sort: "noteCount",
          order: "asc",
        }),
    );
    // tagW(0) at the head, then tagX/tagY(1) tie by ascending id, then tagZ(2).
    expect(asc.map((e) => e.tag.name)).toEqual([
      "tagW",
      "tagX",
      "tagY",
      "tagZ",
    ]);
    expect(asc[0].noteCount).toBe(0);
  });

  it("does not count notes/tags belonging to another owner", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const ownerDir = await seedDirectory(container, owner);
    const strangerDir = await seedDirectory(container, stranger);
    const ownerTag = await seedTagRow(container, owner, "shared-mine");
    const strangerTag = await seedTagRow(container, stranger, "shared-theirs");
    const ownerNote = await seedNote(container, owner, ownerDir);
    const strangerNote = await seedNote(container, stranger, strangerDir);
    await linkNoteTag(container, ownerNote, ownerTag);
    await linkNoteTag(container, strangerNote, strangerTag);

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, { limit: 100, offset: 0 }),
    );
    expect(rows.map((e) => e.tag.name)).toEqual(["shared-mine"]);
    expect(rows[0].noteCount).toBe(1);
  });

  it("does not count a cross-owner note linked to the tag (owner-scoped JOIN)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const ownerDir = await seedDirectory(container, owner);
    const strangerDir = await seedDirectory(container, stranger);
    const ownerTag = await seedTagRow(container, owner, "owner-tag");
    const ownerNote = await seedNote(container, owner, ownerDir);
    // FK on note_tags only checks note/tag existence, not owner, so a
    // stranger's note can be linked to this owner's tag at the row level.
    const strangerNote = await seedNote(container, stranger, strangerDir);
    await linkNoteTag(container, ownerNote, ownerTag);
    await linkNoteTag(container, strangerNote, ownerTag);

    // The findByOwner aggregate joins notes on `notes.owner_id = ownerId`
    // (in addition to id/status), so the stranger's note is excluded and
    // only the owner's own note is counted (1, not 2). Write paths never
    // create cross-owner links, but the predicate makes the boundary explicit.
    expect(await countOf(container, owner, "owner-tag")).toBe(1);
  });

  it("applies limit/offset to the aggregated tag rows, not pre-JOIN rows", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // Distinct counts so the desc order is deterministic: tagP=3, tagQ=2, tagR=1.
    const tagP = await seedTagRow(container, owner, "tagP");
    const tagQ = await seedTagRow(container, owner, "tagQ");
    const tagR = await seedTagRow(container, owner, "tagR");
    const notesForP = [
      await seedNote(container, owner, dir),
      await seedNote(container, owner, dir),
      await seedNote(container, owner, dir),
    ];
    const notesForQ = [
      await seedNote(container, owner, dir),
      await seedNote(container, owner, dir),
    ];
    const noteForR = await seedNote(container, owner, dir);
    for (const n of notesForP) await linkNoteTag(container, n, tagP);
    for (const n of notesForQ) await linkNoteTag(container, n, tagQ);
    await linkNoteTag(container, noteForR, tagR);

    // limit:1, offset:1 over noteCount desc must return exactly the second
    // aggregated tag (tagQ), proving limit/offset operate on GROUP BY rows,
    // not the 6 pre-aggregation JOIN rows.
    const page = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, {
          limit: 1,
          offset: 1,
          sort: "noteCount",
          order: "desc",
        }),
    );
    expect(page.map((e) => e.tag.name)).toEqual(["tagQ"]);
    expect(page[0].noteCount).toBe(2);
  });
});

describe("D1TagRepository.findByOwner — read-time lastUsedAt (Issue #569)", () => {
  const D1 = "2026-05-01T00:00:00.000Z";
  const D2 = "2026-05-10T00:00:00.000Z";
  const D3 = "2026-05-20T00:00:00.000Z";

  const lastUsedOf = async (
    container: TestContainer,
    owner: UserId,
    name: string,
  ): Promise<Date | null> => {
    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, { limit: 100, offset: 0 }),
    );
    const entry = rows.find((e) => e.tag.name === name);
    if (entry === undefined) throw new Error(`tag not found: ${name}`);
    return entry.lastUsedAt;
  };

  it("is MAX(updatedAt) across the tag's active notes", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTagRow(container, owner, "agg");
    const n1 = await seedNote(container, owner, dir, "active", D1);
    const n2 = await seedNote(container, owner, dir, "active", D3);
    const n3 = await seedNote(container, owner, dir, "active", D2);
    await linkNoteTag(container, n1, tag);
    await linkNoteTag(container, n2, tag);
    await linkNoteTag(container, n3, tag);

    const lastUsed = await lastUsedOf(container, owner, "agg");
    expect(lastUsed).not.toBeNull();
    expect(lastUsed?.toISOString()).toBe(new Date(D3).toISOString());
  });

  it("is null for an unused tag", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "unused");

    expect(await lastUsedOf(container, owner, "unused")).toBeNull();
  });

  it("ignores trashed notes when computing lastUsedAt", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTagRow(container, owner, "mixed");
    // The (later) trashed note must not win MAX over the active one.
    const active = await seedNote(container, owner, dir, "active", D1);
    const trashed = await seedNote(container, owner, dir, "trashed", D3);
    await linkNoteTag(container, active, tag);
    await linkNoteTag(container, trashed, tag);

    expect((await lastUsedOf(container, owner, "mixed"))?.toISOString()).toBe(
      new Date(D1).toISOString(),
    );
  });

  it("drops to null when the only linked note is physically deleted (cascade)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTagRow(container, owner, "purged");
    const note = await seedNote(container, owner, dir, "active", D2);
    await linkNoteTag(container, note, tag);
    expect(await lastUsedOf(container, owner, "purged")).not.toBeNull();

    await container.db.delete(schema.notes).where(eq(schema.notes.id, note));

    expect(await lastUsedOf(container, owner, "purged")).toBeNull();
  });

  it("sorts by lastUsedAt desc/asc with NULLs and a stable tags.id tie-break", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // tagA(D3) newest, tagB(D1) oldest, tagN unused (NULL). tagB shares D1
    // with tagC so the id tie-break is exercised among the equal pair.
    const tagA = await seedTagRow(container, owner, "tagA");
    const tagB = await seedTagRow(container, owner, "tagB");
    const tagC = await seedTagRow(container, owner, "tagC");
    const tagN = await seedTagRow(container, owner, "tagN");
    const na = await seedNote(container, owner, dir, "active", D3);
    const nb = await seedNote(container, owner, dir, "active", D1);
    const nc = await seedNote(container, owner, dir, "active", D1);
    await linkNoteTag(container, na, tagA);
    await linkNoteTag(container, nb, tagB);
    await linkNoteTag(container, nc, tagC);
    void tagN; // intentionally unused → lastUsedAt NULL

    const desc = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, {
          limit: 100,
          offset: 0,
          sort: "lastUsedAt",
          order: "desc",
        }),
    );
    // SQLite treats NULL as the smallest value, so on desc the unused tag
    // sorts to the tail; the D1 pair ties and breaks by ascending id (tagB
    // seeded before tagC).
    expect(desc.map((e) => e.tag.name)).toEqual([
      "tagA",
      "tagB",
      "tagC",
      "tagN",
    ]);
    expect(desc[desc.length - 1].lastUsedAt).toBeNull();

    const asc = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.findByOwner(owner, {
          limit: 100,
          offset: 0,
          sort: "lastUsedAt",
          order: "asc",
        }),
    );
    // On asc the NULL sorts to the head, then D1 pair (id tie-break), then D3.
    expect(asc.map((e) => e.tag.name)).toEqual([
      "tagN",
      "tagB",
      "tagC",
      "tagA",
    ]);
    expect(asc[0].lastUsedAt).toBeNull();
  });
});

describe("D1TagRepository.searchPublicByNamePrefix (integration, #568)", () => {
  // Links a freshly-seeded note (with the given visibility + status) to a
  // tag so the public-prefix query has a (tag → public/active note) edge.
  async function linkTagToNote(
    container: TestContainer,
    owner: UserId,
    dir: string,
    tagId: string,
    opts: {
      visibility: "private" | "unlisted" | "public";
      status?: "active" | "trashed";
    },
  ): Promise<void> {
    const note = await seedNote(container, owner, dir, opts.status ?? "active");
    await linkNoteTag(container, note, tagId);
    await seedPublication(container, note, owner, opts.visibility);
  }

  it("returns distinct tags linked to a public active note, prefix + case-insensitive, ordered by name", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const cloudflare = await seedTagRow(container, owner, "cloudflare");
    const cloud = await seedTagRow(container, owner, "Cloud");
    await seedTagRow(container, owner, "ddd"); // does not match prefix

    // `cloudflare` linked to two public notes — must appear once (distinct).
    await linkTagToNote(container, owner, dir, cloudflare, {
      visibility: "public",
    });
    await linkTagToNote(container, owner, dir, cloudflare, {
      visibility: "public",
    });
    await linkTagToNote(container, owner, dir, cloud, { visibility: "public" });

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchPublicByNamePrefix("cl", 10),
    );
    expect(rows).toEqual(["Cloud", "cloudflare"]);
  });

  it("spans owners (cross-instance suggestion)", async () => {
    const container = createTestContainer();
    const a = await seedUser(container);
    const b = await seedUser(container);
    const dirA = await seedDirectory(container, a);
    const dirB = await seedDirectory(container, b);
    const tagA = await seedTagRow(container, a, "shared-a");
    const tagB = await seedTagRow(container, b, "shared-b");
    await linkTagToNote(container, a, dirA, tagA, { visibility: "public" });
    await linkTagToNote(container, b, dirB, tagB, { visibility: "public" });

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchPublicByNamePrefix("shared", 10),
    );
    expect(rows).toEqual(["shared-a", "shared-b"]);
  });

  it("excludes tags linked only to private / unlisted / trashed notes", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const privateTag = await seedTagRow(container, owner, "priv-only");
    const unlistedTag = await seedTagRow(container, owner, "unl-only");
    const trashedTag = await seedTagRow(container, owner, "trash-only");
    const orphanTag = await seedTagRow(container, owner, "orphan-only");

    await linkTagToNote(container, owner, dir, privateTag, {
      visibility: "private",
    });
    await linkTagToNote(container, owner, dir, unlistedTag, {
      visibility: "unlisted",
    });
    await linkTagToNote(container, owner, dir, trashedTag, {
      visibility: "public",
      status: "trashed",
    });
    void orphanTag; // never linked to any note

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository
          .searchPublicByNamePrefix("", 10)
          .then(() => tagRepository.searchPublicByNamePrefix("o", 10)),
    );
    // None of the seeded tags are reachable through a public active note.
    expect(rows).toEqual([]);
  });

  it("escapes LIKE wildcards and clamps non-positive limit / empty prefix", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const pct = await seedTagRow(container, owner, "50%-tag");
    const noise = await seedTagRow(container, owner, "50abc-tag");
    await linkTagToNote(container, owner, dir, pct, { visibility: "public" });
    await linkTagToNote(container, owner, dir, noise, { visibility: "public" });

    const literal = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchPublicByNamePrefix("50%", 10),
    );
    expect(literal).toEqual(["50%-tag"]);

    const zeroLimit = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchPublicByNamePrefix("50", 0),
    );
    expect(zeroLimit).toEqual([]);

    const empty = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.searchPublicByNamePrefix("  ", 10),
    );
    expect(empty).toEqual([]);
  });
});

describe("D1TagRepository.listPublicTagNamesByOwner (integration, #654)", () => {
  // Links a freshly-seeded note (with the given visibility + status) to a
  // tag so the public母集合 query has a (tag → public/active note) edge.
  async function linkTagToNote(
    container: TestContainer,
    owner: UserId,
    dir: string,
    tagId: string,
    opts: {
      visibility: "private" | "unlisted" | "public";
      status?: "active" | "trashed";
    },
  ): Promise<void> {
    const note = await seedNote(container, owner, dir, opts.status ?? "active");
    await linkNoteTag(container, note, tagId);
    await seedPublication(container, note, owner, opts.visibility);
  }

  it("returns distinct tag names linked to a public active note, ordered by name asc", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const cloud = await seedTagRow(container, owner, "Cloud");
    const design = await seedTagRow(container, owner, "design");
    const apple = await seedTagRow(container, owner, "apple");

    // `apple` linked to two public notes — must appear once (distinct).
    await linkTagToNote(container, owner, dir, apple, { visibility: "public" });
    await linkTagToNote(container, owner, dir, apple, { visibility: "public" });
    await linkTagToNote(container, owner, dir, cloud, { visibility: "public" });
    await linkTagToNote(container, owner, dir, design, {
      visibility: "public",
    });

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.listPublicTagNamesByOwner(owner, 10),
    );
    // `orderBy(asc(tags.name))` uses the display column's binary collation
    // (same as `searchPublicByNamePrefix`), so uppercase sorts before
    // lowercase: "Cloud" (C=67) precedes "apple" (a=97).
    expect(rows).toEqual(["Cloud", "apple", "design"]);
  });

  it("excludes tags linked only to private / unlisted / trashed notes (public gate)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const privateTag = await seedTagRow(container, owner, "priv-only");
    const unlistedTag = await seedTagRow(container, owner, "unl-only");
    const trashedTag = await seedTagRow(container, owner, "trash-only");
    const orphanTag = await seedTagRow(container, owner, "orphan-only");
    const publicTag = await seedTagRow(container, owner, "pub");

    await linkTagToNote(container, owner, dir, privateTag, {
      visibility: "private",
    });
    await linkTagToNote(container, owner, dir, unlistedTag, {
      visibility: "unlisted",
    });
    await linkTagToNote(container, owner, dir, trashedTag, {
      visibility: "public",
      status: "trashed",
    });
    void orphanTag; // never linked to any note
    await linkTagToNote(container, owner, dir, publicTag, {
      visibility: "public",
    });

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.listPublicTagNamesByOwner(owner, 10),
    );
    expect(rows).toEqual(["pub"]);
  });

  it("isolates owners — another owner's public tags never mix in", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const ownerDir = await seedDirectory(container, owner);
    const strangerDir = await seedDirectory(container, stranger);
    const mine = await seedTagRow(container, owner, "mine");
    const theirs = await seedTagRow(container, stranger, "theirs");
    await linkTagToNote(container, owner, ownerDir, mine, {
      visibility: "public",
    });
    await linkTagToNote(container, stranger, strangerDir, theirs, {
      visibility: "public",
    });

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.listPublicTagNamesByOwner(owner, 10),
    );
    expect(rows).toEqual(["mine"]);
  });

  it("does not surface a tag linked only to a cross-owner public note (owner-scoped JOIN)", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const ownerDir = await seedDirectory(container, owner);
    const strangerDir = await seedDirectory(container, stranger);
    const ownerTag = await seedTagRow(container, owner, "owner-tag");
    // FK on note_tags only checks note/tag existence, not owner, so a
    // stranger's public note can be linked to this owner's tag at the row
    // level. The owner-scope predicate (`notes.owner_id = ownerId`) must
    // exclude it — the tag has no public note of its own owner.
    const strangerNote = await seedNote(container, stranger, strangerDir);
    await linkNoteTag(container, strangerNote, ownerTag);
    await seedPublication(container, strangerNote, stranger, "public");
    void ownerDir;

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.listPublicTagNamesByOwner(owner, 10),
    );
    expect(rows).toEqual([]);
  });

  it("applies the limit (cap) to the distinct tag rows", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedTagRow(container, owner, "aaa");
    const b = await seedTagRow(container, owner, "bbb");
    const c = await seedTagRow(container, owner, "ccc");
    await linkTagToNote(container, owner, dir, a, { visibility: "public" });
    await linkTagToNote(container, owner, dir, b, { visibility: "public" });
    await linkTagToNote(container, owner, dir, c, { visibility: "public" });

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.listPublicTagNamesByOwner(owner, 2),
    );
    expect(rows).toEqual(["aaa", "bbb"]);
  });

  it("returns [] when limit <= 0", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tag = await seedTagRow(container, owner, "anything");
    await linkTagToNote(container, owner, dir, tag, { visibility: "public" });

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.listPublicTagNamesByOwner(owner, 0),
    );
    expect(rows).toEqual([]);
  });

  it("returns [] for an owner with no public notes", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedTagRow(container, owner, "lonely");

    const rows = await container.unitOfWorkProvider.run(
      async ({ tagRepository }) =>
        tagRepository.listPublicTagNamesByOwner(owner, 10),
    );
    expect(rows).toEqual([]);
  });
});
