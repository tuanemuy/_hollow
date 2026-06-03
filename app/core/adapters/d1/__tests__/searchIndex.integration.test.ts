import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { SearchDocument } from "@/core/domain/search/entity";
import { SearchQuery } from "@/core/domain/search/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

// `search_documents` has `FOREIGN KEY(note_id) REFERENCES notes(id)` and
// `FOREIGN KEY(owner_id) REFERENCES users(id)` (`0001_hollow_schema.sql:371`),
// so a populated `users` + `notes` + `directories` chain is required
// before any `searchIndex.upsert` will succeed.

/**
 * D1 SearchIndex integration tests. Targets the trigram-tokenizer switch
 * from Issue #50 — exercises CJK partial-match, the ASCII regression
 * surface, and the adapter-side short-token guard. These are SQL-layer
 * concerns that the fake `SearchIndex` (used by application-layer tests)
 * cannot detect.
 *
 * Note: the harness applies migrations once per file in `beforeAll` and
 * clears `search_documents` in `beforeEach`. The migration's
 * `INSERT ... SELECT FROM search_documents` rebuild is therefore not
 * covered here (no rows exist at migrate time in the test isolate); that
 * path is verified via manual test on a populated D1.
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
): Promise<NoteId> {
  const id = nextId(0x03);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `note-${id.slice(9, 13)}`,
    title: `Note ${id.slice(-4)}`,
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

async function makeDoc(
  container: TestContainer,
  params: {
    ownerId: UserId;
    directoryId: string;
    title: string;
    body: string;
    visibility?: "private" | "unlisted" | "public";
    tagNames?: readonly string[];
  },
) {
  const noteId = await seedNote(container, params.ownerId, params.directoryId);
  const snapshot = {
    noteId,
    ownerId: params.ownerId,
    visibility: params.visibility ?? "private",
    title: params.title,
    plainBody: params.body,
    tagNames: params.tagNames ?? [],
    directoryPath: "",
    frontMatterDate: null,
    updatedAt: NOW,
  } as const;
  return SearchDocument.fromSnapshot(snapshot, NOW);
}

function makeQuery(params: {
  keyword: string;
  visibilityFilter?: readonly ("private" | "unlisted" | "public")[];
  ownerIdFilter?: UserId | null;
  tagNames?: readonly string[];
  dateRange?: { from: Date; to: Date } | null;
  limit?: number;
  cursor?: string | null;
}) {
  return SearchQuery.create({
    keyword: params.keyword,
    ownerIdFilter: params.ownerIdFilter ?? null,
    visibilityFilter: params.visibilityFilter ?? [
      "private",
      "unlisted",
      "public",
    ],
    tagNames: params.tagNames ?? [],
    directoryPathPrefix: null,
    dateRange: params.dateRange ?? null,
    limit: params.limit ?? 10,
    cursor: params.cursor ?? null,
  });
}

describe("D1SearchIndex (trigram tokenizer)", () => {
  it("returns CJK partial matches against indexed body", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "メモ",
        body: "これはデザイン原則のメモです",
      }),
    );

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "デザイン" }),
    );

    expect(result.hits).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("preserves ASCII keyword matches (regression baseline)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "App",
        body: "Design principles for the app",
      }),
    );

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "Design" }),
    );

    expect(result.hits).toHaveLength(1);
  });

  it("matches mixed CJK / ASCII content from either side", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Project Note",
        body: "Project デザイン草案",
      }),
    );

    const cjk = await container.searchIndex.query(
      makeQuery({ keyword: "デザイン" }),
    );
    expect(cjk.hits).toHaveLength(1);

    const ascii = await container.searchIndex.query(
      makeQuery({ keyword: "Project" }),
    );
    expect(ascii.hits).toHaveLength(1);
  });

  it("falls back to LIKE for short tokens that trigram cannot index", async () => {
    // Short tokens (< 3 codepoints) cannot match through trigram MATCH,
    // so the adapter routes them to the LIKE fallback over the host
    // table. This replaces the former `'""'` zero-hit guard. The body
    // below contains `AI` and the emoji; both must now match.
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Note",
        body: "これはデザイン原則のメモです Design principles 🎨 art について AI 活用",
      }),
    );

    const asciiShort = await container.searchIndex.query(
      makeQuery({ keyword: "AI" }),
    );
    expect(asciiShort.hits).toHaveLength(1);
    expect(asciiShort.nextCursor).toBeNull();

    // Surrogate-pair emoji = 1 Unicode codepoint. It is shorter than the
    // trigram minimum and so flows through the LIKE fallback, which can
    // match it literally.
    const emoji = await container.searchIndex.query(
      makeQuery({ keyword: "🎨" }),
    );
    expect(emoji.hits).toHaveLength(1);
    expect(emoji.nextCursor).toBeNull();

    // A short keyword the body does not contain still returns nothing.
    const cjkShort = await container.searchIndex.query(
      makeQuery({ keyword: "猫" }),
    );
    expect(cjkShort.hits).toEqual([]);
    expect(cjkShort.nextCursor).toBeNull();
  });

  it("matches a CJK short keyword via the LIKE fallback (本)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "メモ",
        body: "面白い本を読んだ記録",
      }),
    );

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "本" }),
    );
    expect(result.hits).toHaveLength(1);
  });

  it("matches a 2-codepoint keyword via the LIKE fallback (Go)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Backend",
        body: "Written in Go for performance",
      }),
    );

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "Go" }),
    );
    expect(result.hits).toHaveLength(1);
  });

  it("LIKE fallback matches on title even when body does not contain the keyword", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "AI roadmap",
        body: "Quarterly planning notes",
      }),
    );

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "AI" }),
    );
    expect(result.hits).toHaveLength(1);
  });

  it("LIKE fallback matches on tag_names_json", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Topic",
        body: "No mention in the body",
        tagNames: ["AI"],
      }),
    );

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "AI" }),
    );
    expect(result.hits).toHaveLength(1);
  });

  it("LIKE fallback honours the shared filters (visibility / owner / dateRange)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const otherOwnerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);
    const otherDirectoryId = await seedDirectory(container, otherOwnerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Mine public",
        body: "AI overview",
        visibility: "public",
      }),
    );
    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Mine private",
        body: "AI overview",
        visibility: "private",
      }),
    );
    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId: otherOwnerId,
        directoryId: otherDirectoryId,
        title: "Theirs public",
        body: "AI overview",
        visibility: "public",
      }),
    );

    const publicOnly = await container.searchIndex.query(
      makeQuery({ keyword: "AI", visibilityFilter: ["public"] }),
    );
    expect(publicOnly.hits).toHaveLength(2);
    expect(publicOnly.hits.every((h) => h.visibility === "public")).toBe(true);

    const mineOnly = await container.searchIndex.query(
      makeQuery({ keyword: "AI", ownerIdFilter: ownerId }),
    );
    expect(mineOnly.hits).toHaveLength(2);
    expect(mineOnly.hits.every((h) => h.ownerId === ownerId)).toBe(true);

    // dateRange filter: the docs are stamped at NOW; a range that ends
    // before NOW must exclude everything.
    const before = new Date("2025-01-01T00:00:00.000Z");
    const beforeRange = await container.searchIndex.query(
      makeQuery({
        keyword: "AI",
        dateRange: { from: before, to: before },
      }),
    );
    expect(beforeRange.hits).toEqual([]);
  });

  it("LIKE fallback returns no hits for a keyword absent from the corpus", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Note",
        body: "Nothing relevant here",
      }),
    );

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "Go" }),
    );
    expect(result.hits).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("LIKE fallback paginates with a stable cursor and no overlap", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    for (let i = 0; i < 3; i += 1) {
      await container.searchIndex.upsert(
        await makeDoc(container, {
          ownerId,
          directoryId,
          title: `Doc ${i}`,
          body: "AI topic body",
        }),
      );
    }

    const first = await container.searchIndex.query(
      makeQuery({ keyword: "AI", limit: 2 }),
    );
    expect(first.hits).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await container.searchIndex.query(
      makeQuery({ keyword: "AI", limit: 2, cursor: first.nextCursor }),
    );
    expect(second.hits).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const firstIds = new Set(first.hits.map((h) => h.noteId));
    expect(second.hits.some((h) => firstIds.has(h.noteId))).toBe(false);
  });

  it("LIKE fallback treats % and _ literally (no wildcard blow-up)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Literal",
        body: "discount is 50% off today",
      }),
    );
    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Other",
        body: "no percentage symbol present",
      }),
    );
    // Underscore literal doc: contains the literal `x_` substring.
    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Underscore",
        body: "value x_y here",
      }),
    );
    // Wildcard control doc: contains `x` followed by another char but no
    // literal `x_`. An unescaped `x_` wildcard would match this; a literal
    // `x_` must not.
    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Control",
        body: "value xzy here",
      }),
    );

    // `%` must match literally — only the doc containing `%` matches,
    // not every row (which an unescaped wildcard would cause).
    const result = await container.searchIndex.query(
      makeQuery({ keyword: "0%" }),
    );
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.title).toBe("Literal");

    // `_` must match literally too. The keyword `x_` (2 codepoints, LIKE
    // path) matches only the doc carrying the literal `x_` substring. If
    // `_` were treated as a wildcard, the `xzy` control doc would also
    // match, blowing the count up to 2.
    const underscore = await container.searchIndex.query(
      makeQuery({ keyword: "x_" }),
    );
    expect(underscore.hits).toHaveLength(1);
    expect(underscore.hits[0]?.title).toBe("Underscore");
  });

  it("LIKE fallback keeps the MATCH path for mixed-length tokens (short token ignored)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    // Body contains `デザイン` but not `AI`. `AI デザイン` has one 3+
    // codepoint token, so it stays on the MATCH path and `AI` is ignored
    // (no LIKE fallback). The doc must still match via `デザイン`.
    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Note",
        body: "これはデザイン原則のメモです",
      }),
    );

    const matched = await container.searchIndex.query(
      makeQuery({ keyword: "AI デザイン" }),
    );
    expect(matched.hits).toHaveLength(1);

    // A doc with only `AI` in the body would not be reachable through
    // this mixed query, proving the short token was dropped rather than
    // routed to LIKE.
    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "AI only",
        body: "AI standalone body without the cjk word",
      }),
    );
    const stillOne = await container.searchIndex.query(
      makeQuery({ keyword: "AI デザイン" }),
    );
    expect(stillOne.hits).toHaveLength(1);
    expect(stillOne.hits[0]?.title).toBe("Note");
  });

  it("LIKE fallback returns score 0 on hits", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Note",
        body: "AI overview body",
      }),
    );

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "AI" }),
    );
    expect(result.hits).toHaveLength(1);
    // `toHit` negates the raw score, yielding `-0`; assert numeric
    // equality (`-0 === 0`) rather than `.toBe(0)`, which distinguishes
    // signed zero via Object.is.
    // Limitation: `toHit` clamps negative scores to 0, so this assertion
    // would still pass if the LIKE path started returning bm25-like
    // values. It guards path regression, not the literal fixed-0 contract.
    expect(result.hits[0]?.score === 0).toBe(true);
  });

  it("respects visibilityFilter alongside the CJK match path", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Private",
        body: "これはデザイン原則の私的メモ",
        visibility: "private",
      }),
    );
    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Public",
        body: "これはデザイン原則の公開メモ",
        visibility: "public",
      }),
    );

    // Filter to `public` only — verifies the private row is excluded.
    const publicOnly = await container.searchIndex.query(
      makeQuery({ keyword: "デザイン", visibilityFilter: ["public"] }),
    );
    expect(publicOnly.hits).toHaveLength(1);
    expect(publicOnly.hits[0]?.visibility).toBe("public");

    // Filter to `private` only — verifies the public row is excluded.
    const privateOnly = await container.searchIndex.query(
      makeQuery({ keyword: "デザイン", visibilityFilter: ["private"] }),
    );
    expect(privateOnly.hits).toHaveLength(1);
    expect(privateOnly.hits[0]?.visibility).toBe("private");

    // Multi-visibility filter — both rows should come back, proving the
    // filter is structurally honoured (not always returning all rows
    // regardless of the input array).
    const both = await container.searchIndex.query(
      makeQuery({
        keyword: "デザイン",
        visibilityFilter: ["public", "private"],
      }),
    );
    expect(both.hits).toHaveLength(2);
    const visibilities = both.hits.map((h) => h.visibility).sort();
    expect(visibilities).toEqual(["private", "public"]);
  });

  it("finds CJK matches after bulkRebuildFromSnapshots (port contract smoke)", async () => {
    // Production wiring does not invoke `bulkRebuildFromSnapshots`
    // today, but exercising the path here keeps the port contract
    // honest — a refactor that breaks the rebuild route would still
    // be caught.
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    // Seed an existing doc whose body also matches the trigram query.
    // This makes the wipe-then-insert semantics observable: if rebuild
    // somehow skipped the wipe, the assertion below would surface two
    // hits instead of one.
    const stale = await makeDoc(container, {
      ownerId,
      directoryId,
      title: "Stale",
      body: "古いデザインの覚書",
    });
    await container.searchIndex.upsert(stale);

    const rebuilt = await makeDoc(container, {
      ownerId,
      directoryId,
      title: "Rebuilt",
      body: "再投入したデザイン原則のメモ",
    });

    async function* docs() {
      yield rebuilt;
    }
    await container.searchIndex.bulkRebuildFromSnapshots(docs());

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "デザイン" }),
    );
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.noteId).toBe(rebuilt.noteId);
    // Explicit negative: the pre-rebuild doc must be gone from the index.
    expect(result.hits.find((h) => h.noteId === stale.noteId)).toBeUndefined();
  });
});
