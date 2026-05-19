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
}) {
  return SearchQuery.create({
    keyword: params.keyword,
    ownerIdFilter: null,
    visibilityFilter: params.visibilityFilter ?? [
      "private",
      "unlisted",
      "public",
    ],
    tagNames: [],
    directoryPathPrefix: null,
    dateRange: null,
    limit: 10,
    cursor: null,
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

  it("returns zero hits for short tokens without throwing (regression guard)", async () => {
    // Regression detection for the adapter-side short-token guard in
    // `buildMatchExpression`. Trigram cannot match query tokens shorter
    // than 3 Unicode codepoints; the adapter must absorb that by
    // dropping them and falling back to the `'""'` literal. If the
    // tokenizer is ever swapped, the intent of this case must be
    // re-evaluated.
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Note",
        body: "これはデザイン原則のメモです Design principles 🎨 art",
      }),
    );

    const cjkShort = await container.searchIndex.query(
      makeQuery({ keyword: "あ" }),
    );
    expect(cjkShort.hits).toEqual([]);
    expect(cjkShort.nextCursor).toBeNull();

    const asciiShort = await container.searchIndex.query(
      makeQuery({ keyword: "AI" }),
    );
    expect(asciiShort.hits).toEqual([]);
    expect(asciiShort.nextCursor).toBeNull();

    // Surrogate-pair emoji = 1 Unicode codepoint. `tok.length` would
    // count it as 2 UTF-16 code units and falsely pass; `Array.from`
    // counts it correctly as 1.
    const emoji = await container.searchIndex.query(
      makeQuery({ keyword: "🎨" }),
    );
    expect(emoji.hits).toEqual([]);
    expect(emoji.nextCursor).toBeNull();
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

    const result = await container.searchIndex.query(
      makeQuery({ keyword: "デザイン", visibilityFilter: ["public"] }),
    );

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.visibility).toBe("public");
  });

  it("finds CJK matches after bulkRebuildFromSnapshots (port contract smoke)", async () => {
    // Production wiring does not invoke `bulkRebuildFromSnapshots`
    // today, but exercising the path here keeps the port contract
    // honest — a refactor that breaks the rebuild route would still
    // be caught.
    const container = createTestContainer();
    const ownerId = await seedUser(container);
    const directoryId = await seedDirectory(container, ownerId);

    await container.searchIndex.upsert(
      await makeDoc(container, {
        ownerId,
        directoryId,
        title: "Old",
        body: "古い内容",
      }),
    );

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
  });
});
