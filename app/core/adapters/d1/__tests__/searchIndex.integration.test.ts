import { eq } from "drizzle-orm";
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
  dateBasis?: "published_at" | "date_for_calendar";
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
    dateBasis: params.dateBasis,
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

    // Default `dateBasis` is `date_for_calendar` (own-notes surface). The
    // docs above are stamped at `date_for_calendar = NOW (2026-01-01)` and
    // have no publication_states row. A window that excludes NOW returns
    // nothing; a window that includes NOW returns the matches — proving the
    // date filter applies via `sd.date_for_calendar` without a publication
    // join (Issue #605 / ADR-006).
    const before = new Date("2025-01-01T00:00:00.000Z");
    const beforeRange = await container.searchIndex.query(
      makeQuery({
        keyword: "AI",
        dateRange: { from: before, to: before },
      }),
    );
    expect(beforeRange.hits).toEqual([]);

    const aroundNow = await container.searchIndex.query(
      makeQuery({
        keyword: "AI",
        dateRange: {
          from: new Date("2025-12-31T00:00:00.000Z"),
          to: new Date("2026-01-02T00:00:00.000Z"),
        },
      }),
    );
    expect(aroundNow.hits).toHaveLength(3);
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

describe("D1SearchIndex.countByDateRanges (P32 facets, #568 / #605)", () => {
  // Stamps a doc at a specific `dateForCalendar` AND seeds a
  // publication_states row with a chosen `publishedAt`. The public date
  // facet windows on `published_at` (#605), so the two are seeded
  // independently here; tests stamp them apart to prove the window follows
  // `published_at`. `makeDoc` hard-codes `updatedAt: NOW`.
  async function upsertAt(
    container: TestContainer,
    params: {
      ownerId: UserId;
      directoryId: string;
      title: string;
      body: string;
      visibility?: "private" | "unlisted" | "public";
      dateForCalendar: Date;
      publishedAt?: Date | null;
    },
  ) {
    const visibility = params.visibility ?? "public";
    const doc = await makeDoc(container, {
      ownerId: params.ownerId,
      directoryId: params.directoryId,
      title: params.title,
      body: params.body,
      visibility,
    });
    await container.searchIndex.upsert(doc);
    await container.db
      .update(schema.searchDocuments)
      .set({ dateForCalendar: params.dateForCalendar.toISOString() })
      .where(eq(schema.searchDocuments.noteId, doc.noteId));
    // `published_at` defaults to `dateForCalendar` unless the test wants the
    // two to differ.
    const publishedAt =
      params.publishedAt === undefined
        ? params.dateForCalendar
        : params.publishedAt;
    await container.db.insert(schema.publicationStates).values({
      noteId: doc.noteId,
      ownerId: params.ownerId,
      visibility,
      publishedAt:
        visibility === "public" && publishedAt !== null
          ? publishedAt.toISOString()
          : null,
      updatedAt: TZ,
      version: 0,
    });
  }

  it("counts hits per date window on published_at, ignoring the query's own dateRange", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    const ref = new Date("2026-06-01T00:00:00.000Z");
    const day = (n: number) => new Date(ref.getTime() - n * 86_400_000);

    // 4 public docs across the timeline: 3 days ago, 20 days ago, 200 days
    // ago, 400 days ago (published_at == dateForCalendar here). Keyword
    // "outbox" matches all four.
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "A",
      body: "outbox topic",
      dateForCalendar: day(3),
    });
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "B",
      body: "outbox topic",
      dateForCalendar: day(20),
    });
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "C",
      body: "outbox topic",
      dateForCalendar: day(200),
    });
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "D",
      body: "outbox topic",
      dateForCalendar: day(400),
    });

    const window = (days: number) => ({ from: day(days), to: ref });
    const ranges = [window(7), window(30), window(365), null];

    const counts = await container.searchIndex.countByDateRanges(
      makeQuery({
        keyword: "outbox",
        visibilityFilter: ["public"],
        dateBasis: "published_at",
      }),
      ranges,
    );
    // past 7d → 1 (day 3); 30d → 2 (day 3, 20); 1y → 3 (day 3, 20, 200);
    // all → 4.
    expect(counts).toEqual([1, 2, 3, 4]);
  });

  it("windows on published_at even when date_for_calendar differs (MATCH path)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    const ref = new Date("2026-06-01T00:00:00.000Z");
    const day = (n: number) => new Date(ref.getTime() - n * 86_400_000);

    // date_for_calendar is recent (within 7d) but published_at is old
    // (>1y): the doc must fall OUT of the 7d/30d/1y windows because the
    // facet follows published_at, not date_for_calendar.
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "Backdated",
      body: "outbox topic",
      dateForCalendar: day(1),
      publishedAt: day(400),
    });
    // A control doc whose published_at is recent.
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "Recent",
      body: "outbox topic",
      dateForCalendar: day(400),
      publishedAt: day(2),
    });

    const window = (days: number) => ({ from: day(days), to: ref });
    const counts = await container.searchIndex.countByDateRanges(
      makeQuery({
        keyword: "outbox",
        visibilityFilter: ["public"],
        dateBasis: "published_at",
      }),
      [window(7), window(30), window(365), null],
    );
    // 7d → 1 (Recent only); 30d → 1; 1y → 1 (Backdated published 400d ago is
    // excluded); all → 2.
    expect(counts).toEqual([1, 1, 1, 2]);
  });

  it("windows on published_at via the LIKE fallback path too", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    const ref = new Date("2026-06-01T00:00:00.000Z");
    const day = (n: number) => new Date(ref.getTime() - n * 86_400_000);

    // "AI" is a short token → LIKE path. date_for_calendar recent,
    // published_at old → excluded from the recent window.
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "Backdated",
      body: "AI overview",
      dateForCalendar: day(1),
      publishedAt: day(400),
    });
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "Recent",
      body: "AI overview",
      dateForCalendar: day(400),
      publishedAt: day(2),
    });

    const window = (days: number) => ({ from: day(days), to: ref });
    const counts = await container.searchIndex.countByDateRanges(
      makeQuery({
        keyword: "AI",
        visibilityFilter: ["public"],
        dateBasis: "published_at",
      }),
      [window(7), null],
    );
    expect(counts).toEqual([1, 2]);
  });

  it("agrees between countByDateRanges and query under a published_at window", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    const ref = new Date("2026-06-01T00:00:00.000Z");
    const day = (n: number) => new Date(ref.getTime() - n * 86_400_000);

    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "Recent",
      body: "outbox topic",
      dateForCalendar: day(400),
      publishedAt: day(2),
    });
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "Backdated",
      body: "outbox topic",
      dateForCalendar: day(1),
      publishedAt: day(400),
    });

    const window = { from: day(7), to: ref };
    const counts = await container.searchIndex.countByDateRanges(
      makeQuery({
        keyword: "outbox",
        visibilityFilter: ["public"],
        dateBasis: "published_at",
      }),
      [window],
    );
    const queryResult = await container.searchIndex.query(
      makeQuery({
        keyword: "outbox",
        visibilityFilter: ["public"],
        dateRange: window,
        dateBasis: "published_at",
      }),
    );
    expect(counts[0]).toBe(1);
    expect(queryResult.hits).toHaveLength(1);
    expect(queryResult.hits[0]?.title).toBe("Recent");
  });

  it("honours visibility filter in the counts (LIKE path)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);
    const ref = new Date("2026-06-01T00:00:00.000Z");

    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "Pub",
      body: "AI overview",
      visibility: "public",
      dateForCalendar: ref,
    });
    await upsertAt(container, {
      ownerId,
      directoryId,
      title: "Priv",
      body: "AI overview",
      visibility: "private",
      dateForCalendar: ref,
    });

    // "AI" is a short token → LIKE path. Public-only filter must count 1.
    // The null window keeps the non-join count path active.
    const counts = await container.searchIndex.countByDateRanges(
      makeQuery({
        keyword: "AI",
        visibilityFilter: ["public"],
        dateBasis: "published_at",
      }),
      [null],
    );
    expect(counts).toEqual([1]);
  });
});

describe("D1SearchIndex own-notes date window (date_for_calendar basis, #605 B-001)", () => {
  // Stamps a doc at a chosen `date_for_calendar` WITHOUT seeding any
  // publication_states row — mirroring a private / unlisted note that has no
  // public publication. The own-notes surface windows on `date_for_calendar`
  // (`dateBasis: 'date_for_calendar'`), so these docs must remain visible to a
  // date-filtered own-notes query even though they would be invisible to the
  // public `published_at` join.
  async function upsertOwnDoc(
    container: TestContainer,
    params: {
      ownerId: UserId;
      directoryId: string;
      title: string;
      body: string;
      visibility: "private" | "unlisted" | "public";
      dateForCalendar: Date;
    },
  ): Promise<NoteId> {
    const doc = await makeDoc(container, {
      ownerId: params.ownerId,
      directoryId: params.directoryId,
      title: params.title,
      body: params.body,
      visibility: params.visibility,
    });
    await container.searchIndex.upsert(doc);
    await container.db
      .update(schema.searchDocuments)
      .set({ dateForCalendar: params.dateForCalendar.toISOString() })
      .where(eq(schema.searchDocuments.noteId, doc.noteId));
    return doc.noteId;
  }

  it("keeps private / unlisted notes (no publication row) inside a date_for_calendar window", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    const ref = new Date("2026-06-01T00:00:00.000Z");
    const day = (n: number) => new Date(ref.getTime() - n * 86_400_000);

    // None of these have a publication_states row. If the adapter joined
    // publication on a date window (the B-001 regression), all three would
    // drop out of a date-filtered own-notes query.
    const privateId = await upsertOwnDoc(container, {
      ownerId,
      directoryId,
      title: "Private",
      body: "outbox notebook",
      visibility: "private",
      dateForCalendar: day(3),
    });
    const unlistedId = await upsertOwnDoc(container, {
      ownerId,
      directoryId,
      title: "Unlisted",
      body: "outbox notebook",
      visibility: "unlisted",
      dateForCalendar: day(5),
    });
    // A doc stamped outside the window must still be excluded — proving the
    // window genuinely filters on `date_for_calendar` rather than being a
    // no-op.
    await upsertOwnDoc(container, {
      ownerId,
      directoryId,
      title: "Old",
      body: "outbox notebook",
      visibility: "private",
      dateForCalendar: day(400),
    });

    const window = { from: day(7), to: ref };
    const result = await container.searchIndex.query(
      makeQuery({
        keyword: "outbox",
        visibilityFilter: ["private", "unlisted", "public"],
        ownerIdFilter: ownerId,
        dateRange: window,
        dateBasis: "date_for_calendar",
      }),
    );

    const ids = result.hits.map((h) => h.noteId).sort();
    expect(ids).toEqual([privateId, unlistedId].sort());
  });

  it("windows on date_for_calendar via the LIKE fallback path too (no publication join)", async () => {
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    const ref = new Date("2026-06-01T00:00:00.000Z");
    const day = (n: number) => new Date(ref.getTime() - n * 86_400_000);

    // "AI" is a short token → LIKE path. Private doc, no publication row.
    const recentId = await upsertOwnDoc(container, {
      ownerId,
      directoryId,
      title: "Recent private",
      body: "AI overview",
      visibility: "private",
      dateForCalendar: day(2),
    });
    await upsertOwnDoc(container, {
      ownerId,
      directoryId,
      title: "Old private",
      body: "AI overview",
      visibility: "private",
      dateForCalendar: day(400),
    });

    const result = await container.searchIndex.query(
      makeQuery({
        keyword: "AI",
        visibilityFilter: ["private", "unlisted", "public"],
        ownerIdFilter: ownerId,
        dateRange: { from: day(7), to: ref },
        dateBasis: "date_for_calendar",
      }),
    );

    expect(result.hits.map((h) => h.noteId)).toEqual([recentId]);
  });
});
