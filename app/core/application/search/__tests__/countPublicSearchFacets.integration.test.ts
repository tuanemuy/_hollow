import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { UserId } from "@/core/domain/identity/valueObject";
import { SearchDocument } from "@/core/domain/search/entity";
import { countPublicSearchFacets } from "../countPublicSearchFacets";

/**
 * Integration test (real SQLite) for the P32 period-facet aggregation. The
 * windows are computed against `container.clock` (system now), so docs are
 * stamped relative to `Date.now()`.
 */

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7fb-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(
  container: TestContainer,
  username?: string,
): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Author",
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: TZ,
    updatedAt: TZ,
    username: username ?? `u-${id.slice(9, 13)}`,
    role: "member",
    banned: 0,
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

// Seeds a note + a public search_documents row + a public
// publication_states row. The period facet windows on `published_at`
// (#605), so the publication row carries the timeline date; the
// `search_documents.date_for_calendar` is stamped to the same value here so
// these baseline tests stay focused on the windowing rather than the
// published_at ≠ date_for_calendar discrimination (covered in the adapter
// integration test).
async function seedDoc(
  container: TestContainer,
  ownerId: UserId,
  directoryId: string,
  publishedAt: Date,
): Promise<void> {
  const noteId = nextId(0x03);
  await container.db.insert(schema.notes).values({
    id: noteId,
    ownerId,
    directoryId,
    slug: `note-${noteId.slice(9, 13)}`,
    title: "Outbox",
    contentHtml: "<p>outbox topic</p>",
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
  const doc = SearchDocument.fromSnapshot(
    {
      noteId: noteId as never,
      ownerId,
      visibility: "public",
      title: "Outbox",
      plainBody: "outbox topic body",
      tagNames: [],
      directoryPath: "",
      frontMatterDate: null,
      updatedAt: publishedAt,
    },
    publishedAt,
  );
  await container.searchIndex.upsert(doc);
  await container.db
    .update(schema.searchDocuments)
    .set({ dateForCalendar: publishedAt.toISOString() })
    .where(eq(schema.searchDocuments.noteId, noteId));
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility: "public",
    publishedAt: publishedAt.toISOString(),
    updatedAt: TZ,
    version: 0,
  });
}

describe("countPublicSearchFacets (integration)", () => {
  const getContainer = setupTestContainer();

  it("counts public hits per rolling period (7d/30d/1y/all)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);

    const now = container.clock.now();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

    await seedDoc(container, owner, dir, daysAgo(2));
    await seedDoc(container, owner, dir, daysAgo(15));
    await seedDoc(container, owner, dir, daysAgo(120));
    await seedDoc(container, owner, dir, daysAgo(400));

    const { facets } = await countPublicSearchFacets({
      container,
      input: { keyword: "outbox" },
    });

    const byPeriod = Object.fromEntries(facets.map((f) => [f.period, f.count]));
    expect(byPeriod["7d"]).toBe(1);
    expect(byPeriod["30d"]).toBe(2);
    expect(byPeriod["1y"]).toBe(3);
    expect(byPeriod.all).toBe(4);
  });

  it("returns all-zero counts for an empty keyword without touching the index", async () => {
    const container = getContainer();
    const { facets } = await countPublicSearchFacets({
      container,
      input: { keyword: "   " },
    });
    expect(facets.map((f) => f.count)).toEqual([0, 0, 0, 0]);
    expect(facets.map((f) => f.period)).toEqual(["7d", "30d", "1y", "all"]);
  });

  it("resolves the `username` owner filter so only that author's hits are counted", async () => {
    const container = getContainer();
    const author = await seedUser(container, "facet-author");
    const other = await seedUser(container);
    const dirA = await seedDirectory(container, author);
    const dirO = await seedDirectory(container, other);

    const now = container.clock.now();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

    await seedDoc(container, author, dirA, daysAgo(2));
    // Another author's hit must not leak into the username-scoped count.
    await seedDoc(container, other, dirO, daysAgo(2));

    const { facets } = await countPublicSearchFacets({
      container,
      input: { keyword: "outbox", username: "facet-author" },
    });
    const byPeriod = Object.fromEntries(facets.map((f) => [f.period, f.count]));
    expect(byPeriod.all).toBe(1);
    expect(byPeriod["7d"]).toBe(1);
  });

  it("throws NotFoundError for a username that does not exist", async () => {
    const container = getContainer();
    const { NotFoundError } = await import("@/core/application/errors");
    await expect(
      countPublicSearchFacets({
        container,
        input: { keyword: "outbox", username: "no-such-user" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
