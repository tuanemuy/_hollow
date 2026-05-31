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
    updatedAt: TZ,
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
