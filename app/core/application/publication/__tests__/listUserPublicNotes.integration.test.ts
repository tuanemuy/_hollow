import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { listUserPublicNotes } from "../listUserPublicNotes";

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7e2-${block}-7000-8000-0000000000${tail}`;
};

const iso = (s: string): string => new Date(s).toISOString();

async function seedUser(
  container: TestContainer,
  username: string,
): Promise<UserId> {
  const id = nextId(0x0a);
  await container.db.insert(schema.users).values({
    id,
    name: "T",
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: iso("2024-01-01T00:00:00.000Z"),
    updatedAt: iso("2024-01-01T00:00:00.000Z"),
    username,
    role: "member",
    banned: 0,
  });
  return id as UserId;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
): Promise<DirectoryId> {
  const id = nextId(0x0b);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: null,
    name: "root",
    slug: `d-${id.slice(9, 13)}`,
    depth: 0,
    version: 0,
    createdAt: iso("2024-01-01T00:00:00.000Z"),
    updatedAt: iso("2024-01-01T00:00:00.000Z"),
  });
  return id as DirectoryId;
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: { title: string; updatedAt: string; status?: "active" | "trashed" },
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: opts.title,
    contentHtml: `<p>${opts.title}</p>`,
    frontMatterJson: "{}",
    status: opts.status ?? "active",
    trashedAt: null,
    sourceFileId: null,
    createdAt: iso("2024-01-01T00:00:00.000Z"),
    updatedAt: iso(opts.updatedAt),
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id as NoteId;
}

async function seedPublic(
  container: TestContainer,
  noteId: NoteId,
  ownerId: UserId,
  visibility: "public" | "private" | "unlisted" = "public",
  publishedAt = "2024-02-01T00:00:00.000Z",
): Promise<void> {
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility,
    publishedAt: visibility === "public" ? iso(publishedAt) : null,
    updatedAt: iso("2024-02-01T00:00:00.000Z"),
    version: 0,
  });
}

async function seedTag(
  container: TestContainer,
  ownerId: UserId,
  name: string,
): Promise<string> {
  const id = nextId(0x0e);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name.toLowerCase(),
    version: 0,
    createdAt: iso("2024-01-01T00:00:00.000Z"),
    updatedAt: iso("2024-01-01T00:00:00.000Z"),
  });
  return id;
}

async function tagNote(
  container: TestContainer,
  noteId: NoteId,
  tagId: string,
): Promise<void> {
  await container.db.insert(schema.noteTags).values({
    noteId,
    tagId,
  });
}

describe("listUserPublicNotes (integration)", () => {
  const getContainer = setupTestContainer();

  it("returns only public, active notes ordered by publishedAt desc (default) with an accurate total", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-a");
    const dir = await seedDirectory(container, owner);

    const older = await seedNote(container, owner, dir, {
      title: "older",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = await seedNote(container, owner, dir, {
      title: "newer",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    // Distinct published_at so the default (publishedAt desc) order is
    // unambiguous: newer published after older.
    await seedPublic(
      container,
      older,
      owner,
      "public",
      "2024-01-01T00:00:00.000Z",
    );
    await seedPublic(
      container,
      newer,
      owner,
      "public",
      "2024-03-01T00:00:00.000Z",
    );

    // A private and a trashed note must be excluded.
    const priv = await seedNote(container, owner, dir, {
      title: "private",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    await seedPublic(container, priv, owner, "private");
    const trashed = await seedNote(container, owner, dir, {
      title: "trashed",
      updatedAt: "2026-02-15T00:00:00.000Z",
      status: "trashed",
    });
    await seedPublic(container, trashed, owner);

    const result = await listUserPublicNotes({
      container,
      input: { username: "owner-a", page: 1, limit: 20 },
    });

    // Default sort is publishedAt desc; the trashed note (still carrying a
    // public publication_states row pre-relay) must NOT inflate the total.
    expect(result.total).toBe(2);
    expect(result.notes.map((n) => n.title)).toEqual(["newer", "older"]);
    expect(result.notes.every((n) => n.visibility === "public")).toBe(true);
    // items.length <= total holds structurally.
    expect(result.notes.length).toBeLessThanOrEqual(result.total);
  });

  it("keeps the filtered total independent of the page window", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-b");
    const dir = await seedDirectory(container, owner);

    for (let i = 0; i < 3; i++) {
      const note = await seedNote(container, owner, dir, {
        title: `note-${i}`,
        updatedAt: `2026-0${i + 1}-01T00:00:00.000Z`,
      });
      await seedPublic(container, note, owner);
    }

    const page1 = await listUserPublicNotes({
      container,
      input: { username: "owner-b", page: 1, limit: 2 },
    });
    expect(page1.total).toBe(3);
    expect(page1.notes.length).toBe(2);

    const page2 = await listUserPublicNotes({
      container,
      input: { username: "owner-b", page: 2, limit: 2 },
    });
    expect(page2.total).toBe(3);
    expect(page2.notes.length).toBe(1);
  });

  it("filters to notes carrying every supplied tag (AND semantics)", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-c");
    const dir = await seedDirectory(container, owner);

    const cloudflare = await seedTag(container, owner, "cloudflare");
    const design = await seedTag(container, owner, "design");

    const both = await seedNote(container, owner, dir, {
      title: "both",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await seedPublic(container, both, owner);
    await tagNote(container, both, cloudflare);
    await tagNote(container, both, design);

    const onlyOne = await seedNote(container, owner, dir, {
      title: "only-cloudflare",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    await seedPublic(container, onlyOne, owner);
    await tagNote(container, onlyOne, cloudflare);

    const single = await listUserPublicNotes({
      container,
      input: {
        username: "owner-c",
        page: 1,
        limit: 20,
        tagNames: ["cloudflare"],
      },
    });
    expect(single.total).toBe(2);
    expect(single.notes.map((n) => n.title).sort()).toEqual([
      "both",
      "only-cloudflare",
    ]);

    const intersection = await listUserPublicNotes({
      container,
      input: {
        username: "owner-c",
        page: 1,
        limit: 20,
        tagNames: ["cloudflare", "design"],
      },
    });
    expect(intersection.total).toBe(1);
    expect(intersection.notes.map((n) => n.title)).toEqual(["both"]);
  });

  it("returns an empty page when a requested tag name does not exist for the owner", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-d");
    const dir = await seedDirectory(container, owner);
    const note = await seedNote(container, owner, dir, {
      title: "n",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await seedPublic(container, note, owner);

    const result = await listUserPublicNotes({
      container,
      input: {
        username: "owner-d",
        page: 1,
        limit: 20,
        tagNames: ["nonexistent"],
      },
    });
    expect(result.total).toBe(0);
    expect(result.notes).toEqual([]);
  });

  it("honours the sort axis (title asc)", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-e");
    const dir = await seedDirectory(container, owner);

    for (const title of ["banana", "apple", "cherry"]) {
      const note = await seedNote(container, owner, dir, {
        title,
        updatedAt: "2026-03-01T00:00:00.000Z",
      });
      await seedPublic(container, note, owner);
    }

    const result = await listUserPublicNotes({
      container,
      input: {
        username: "owner-e",
        page: 1,
        limit: 20,
        sort: "title",
        order: "asc",
      },
    });
    expect(result.notes.map((n) => n.title)).toEqual([
      "apple",
      "banana",
      "cherry",
    ]);
  });

  it("orders by publishedAt and preserves that order through hydration", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-pub");
    const dir = await seedDirectory(container, owner);

    // published_at order intentionally differs from both insertion order
    // and updatedAt order so a hydration that lost the port's ordering
    // (e.g. findByIds returning a different order) would fail this.
    const a = await seedNote(container, owner, dir, {
      title: "a",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    const b = await seedNote(container, owner, dir, {
      title: "b",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const c = await seedNote(container, owner, dir, {
      title: "c",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await seedPublic(container, a, owner, "public", "2024-02-01T00:00:00.000Z");
    await seedPublic(container, b, owner, "public", "2024-03-01T00:00:00.000Z");
    await seedPublic(container, c, owner, "public", "2024-01-01T00:00:00.000Z");

    const desc = await listUserPublicNotes({
      container,
      input: { username: "owner-pub", page: 1, limit: 20, sort: "publishedAt" },
    });
    // b (Mar) > a (Feb) > c (Jan)
    expect(desc.notes.map((n) => n.title)).toEqual(["b", "a", "c"]);
    expect(desc.total).toBe(3);

    const asc = await listUserPublicNotes({
      container,
      input: {
        username: "owner-pub",
        page: 1,
        limit: 20,
        sort: "publishedAt",
        order: "asc",
      },
    });
    expect(asc.notes.map((n) => n.title)).toEqual(["c", "a", "b"]);
  });

  it("composes the tag AND-filter with publishedAt order and an independent total", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-pub-tag");
    const dir = await seedDirectory(container, owner);
    const design = await seedTag(container, owner, "design");

    const first = await seedNote(container, owner, dir, {
      title: "first",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const second = await seedNote(container, owner, dir, {
      title: "second",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const third = await seedNote(container, owner, dir, {
      title: "third",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await seedPublic(
      container,
      first,
      owner,
      "public",
      "2024-01-01T00:00:00.000Z",
    );
    await seedPublic(
      container,
      second,
      owner,
      "public",
      "2024-02-01T00:00:00.000Z",
    );
    await seedPublic(
      container,
      third,
      owner,
      "public",
      "2024-03-01T00:00:00.000Z",
    );
    await tagNote(container, first, design);
    await tagNote(container, second, design);
    await tagNote(container, third, design);

    // A note WITHOUT the tag must not appear and must not count.
    const untagged = await seedNote(container, owner, dir, {
      title: "untagged",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await seedPublic(
      container,
      untagged,
      owner,
      "public",
      "2024-04-01T00:00:00.000Z",
    );

    const page1 = await listUserPublicNotes({
      container,
      input: {
        username: "owner-pub-tag",
        page: 1,
        limit: 2,
        sort: "publishedAt",
        tagNames: ["design"],
      },
    });
    expect(page1.total).toBe(3);
    // publishedAt desc within the tagged set: third (Mar) > second (Feb).
    expect(page1.notes.map((n) => n.title)).toEqual(["third", "second"]);

    const page2 = await listUserPublicNotes({
      container,
      input: {
        username: "owner-pub-tag",
        page: 2,
        limit: 2,
        sort: "publishedAt",
        tagNames: ["design"],
      },
    });
    expect(page2.total).toBe(3);
    expect(page2.notes.map((n) => n.title)).toEqual(["first"]);
  });

  // #619: the projection carries the publication aggregate's published_at so
  // the public listing can render「YYYY年M月D日 公開」.
  it("projects the publication published_at onto every listing item", async () => {
    const container = getContainer();
    const owner = await seedUser(container, "owner-projection");
    const dir = await seedDirectory(container, owner);

    const a = await seedNote(container, owner, dir, {
      title: "a",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    const b = await seedNote(container, owner, dir, {
      title: "b",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    await seedPublic(container, a, owner, "public", "2024-03-01T00:00:00.000Z");
    await seedPublic(container, b, owner, "public", "2024-01-01T00:00:00.000Z");

    // publishedAt path.
    const byPublished = await listUserPublicNotes({
      container,
      input: { username: "owner-projection", page: 1, limit: 20 },
    });
    expect(
      byPublished.notes.map((n) => ({
        title: n.title,
        publishedAt: n.publishedAt,
      })),
    ).toEqual([
      { title: "a", publishedAt: iso("2024-03-01T00:00:00.000Z") },
      { title: "b", publishedAt: iso("2024-01-01T00:00:00.000Z") },
    ]);

    // noteColumn path (title sort) carries the same projection.
    const byTitle = await listUserPublicNotes({
      container,
      input: {
        username: "owner-projection",
        page: 1,
        limit: 20,
        sort: "title",
        order: "asc",
      },
    });
    expect(byTitle.notes.map((n) => n.publishedAt)).toEqual([
      iso("2024-03-01T00:00:00.000Z"),
      iso("2024-01-01T00:00:00.000Z"),
    ]);
  });

  // #619: the publishedRange filter is honoured on the publishedAt path
  // (publication SQL) and the noteColumn path (resolved candidate ids), with
  // the inclusive end date and the from-only / to-only / same-day boundaries.
  describe("publishedRange filter", () => {
    async function seedRangeOwner(container: TestContainer, username: string) {
      const owner = await seedUser(container, username);
      const dir = await seedDirectory(container, owner);
      // Three notes published on Jan 10 / Feb 10 / Mar 10.
      const titles = ["jan", "feb", "mar"] as const;
      const pub = {
        jan: "2026-01-10T08:00:00.000Z",
        feb: "2026-02-10T08:00:00.000Z",
        mar: "2026-03-10T08:00:00.000Z",
      };
      for (const title of titles) {
        const note = await seedNote(container, owner, dir, {
          title,
          updatedAt: "2026-04-01T00:00:00.000Z",
        });
        await seedPublic(container, note, owner, "public", pub[title]);
      }
      return username;
    }

    const range = (from: string | null, to: string | null) => ({
      from: from === null ? null : new Date(from),
      to: to === null ? null : new Date(to),
    });

    it("filters by published_at range on the publishedAt path", async () => {
      const container = getContainer();
      const username = await seedRangeOwner(container, "range-pub");
      // Feb 1 .. Mar 1 (exclusive) → only feb.
      const r = await listUserPublicNotes({
        container,
        input: {
          username,
          page: 1,
          limit: 20,
          sort: "publishedAt",
          publishedRange: range(
            "2026-02-01T00:00:00.000Z",
            "2026-03-01T00:00:00.000Z",
          ),
        },
      });
      expect(r.total).toBe(1);
      expect(r.notes.map((n) => n.title)).toEqual(["feb"]);
    });

    it("filters by published_at range on the noteColumn path (title sort)", async () => {
      const container = getContainer();
      const username = await seedRangeOwner(container, "range-col");
      const r = await listUserPublicNotes({
        container,
        input: {
          username,
          page: 1,
          limit: 20,
          sort: "title",
          order: "asc",
          publishedRange: range(
            "2026-02-01T00:00:00.000Z",
            "2026-03-01T00:00:00.000Z",
          ),
        },
      });
      expect(r.total).toBe(1);
      expect(r.notes.map((n) => n.title)).toEqual(["feb"]);
    });

    it("from-only includes everything on/after the bound", async () => {
      const container = getContainer();
      const username = await seedRangeOwner(container, "range-from");
      const r = await listUserPublicNotes({
        container,
        input: {
          username,
          page: 1,
          limit: 20,
          sort: "publishedAt",
          order: "asc",
          publishedRange: range("2026-02-01T00:00:00.000Z", null),
        },
      });
      expect(r.notes.map((n) => n.title)).toEqual(["feb", "mar"]);
    });

    it("to-only includes everything before the exclusive bound", async () => {
      const container = getContainer();
      const username = await seedRangeOwner(container, "range-to");
      const r = await listUserPublicNotes({
        container,
        input: {
          username,
          page: 1,
          limit: 20,
          sort: "publishedAt",
          order: "asc",
          publishedRange: range(null, "2026-02-11T00:00:00.000Z"),
        },
      });
      // Feb 10 08:00 < Feb 11 00:00 → jan + feb included, mar excluded.
      expect(r.notes.map((n) => n.title)).toEqual(["jan", "feb"]);
    });

    it("end-date inclusive: the day-after-00:00 exclusive bound keeps the end day", async () => {
      const container = getContainer();
      const username = await seedRangeOwner(container, "range-incl");
      // The presentation boundary turns an inclusive `to=2026-02-10` into the
      // exclusive 2026-02-11T00:00. A note published on 2026-02-10 08:00 must
      // stay in the window.
      const r = await listUserPublicNotes({
        container,
        input: {
          username,
          page: 1,
          limit: 20,
          sort: "publishedAt",
          publishedRange: range(
            "2026-02-10T00:00:00.000Z",
            "2026-02-11T00:00:00.000Z",
          ),
        },
      });
      expect(r.notes.map((n) => n.title)).toEqual(["feb"]);
    });

    it("returns an empty page when the range matches nothing (noteColumn path)", async () => {
      const container = getContainer();
      const username = await seedRangeOwner(container, "range-empty");
      const r = await listUserPublicNotes({
        container,
        input: {
          username,
          page: 1,
          limit: 20,
          sort: "title",
          publishedRange: range(
            "2025-01-01T00:00:00.000Z",
            "2025-02-01T00:00:00.000Z",
          ),
        },
      });
      expect(r.total).toBe(0);
      expect(r.notes).toEqual([]);
    });

    it("noteColumn path with period filter returns only notes with non-null publishedAt", async () => {
      const container = getContainer();
      const username = await seedRangeOwner(container, "range-pub-check");
      // Filter to Feb → expect feb note only, and its publishedAt must be set.
      const r = await listUserPublicNotes({
        container,
        input: {
          username,
          page: 1,
          limit: 20,
          sort: "updatedAt",
          order: "desc",
          publishedRange: range(
            "2026-02-01T00:00:00.000Z",
            "2026-02-28T00:00:00.000Z",
          ),
        },
      });
      expect(r.notes).toHaveLength(1);
      expect(r.notes[0]?.title).toBe("feb");
      // Every returned note must have a publishedAt (this is the assertion that
      // the period filter only includes public/published notes).
      expect(r.notes.every((n) => n.publishedAt !== null)).toBe(true);
    });
  });
});
