import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import { isForbiddenError } from "@/core/application/errors";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import { SearchKeyword, SearchQuery } from "@/core/domain/search/valueObject";
import { rebuildSearchIndex } from "../rebuildSearchIndex";

const TZ = new Date("2026-01-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d0-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(
  container: TestContainer,
  opts: { role: "admin" | "member" } = { role: "member" },
): Promise<UserId> {
  const id = nextId(0x0a);
  await container.db.insert(schema.users).values({
    id,
    name: "Test User",
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: TZ,
    updatedAt: TZ,
    username: `u-${id.slice(9, 13)}`,
    role: opts.role,
    banned: 0,
  });
  return id as UserId;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
  over: Partial<{
    parentId: DirectoryId | null;
    name: string;
    slug: string;
    depth: number;
  }> = {},
): Promise<DirectoryId> {
  const id = nextId(0x0b);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: over.parentId ?? null,
    name: over.name ?? "",
    slug: over.slug ?? "",
    depth: over.depth ?? 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id as DirectoryId;
}

async function seedNote(
  container: TestContainer,
  params: {
    ownerId: UserId;
    directoryId: DirectoryId;
    status?: "active" | "trashed";
    title?: string;
    frontMatter?: string;
  },
): Promise<string> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId: params.ownerId,
    directoryId: params.directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: params.title ?? `Note ${id.slice(-4)}`,
    contentHtml: "<p>body</p>",
    frontMatterJson: params.frontMatter ?? "{}",
    status: params.status ?? "active",
    trashedAt: params.status === "trashed" ? TZ : null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id;
}

async function seedPublicationState(
  container: TestContainer,
  params: {
    noteId: string;
    ownerId: UserId;
    visibility: "private" | "unlisted" | "public";
  },
): Promise<void> {
  await container.db.insert(schema.publicationStates).values({
    noteId: params.noteId,
    ownerId: params.ownerId,
    visibility: params.visibility,
    publishedAt: params.visibility === "public" ? TZ : null,
    updatedAt: TZ,
    version: 0,
  });
}

describe("rebuildSearchIndex (integration)", () => {
  const getContainer = setupTestContainer();

  it("rejects non-admin actors with ForbiddenError", async () => {
    const container = getContainer();
    const member = await seedUser(container, { role: "member" });

    let caught: unknown;
    try {
      await rebuildSearchIndex({
        container,
        input: { actorUserId: member as unknown as string },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });

  it("returns processedCount=0 when no notes exist", async () => {
    const container = getContainer();
    const admin = await seedUser(container, { role: "admin" });

    const result = await rebuildSearchIndex({
      container,
      input: { actorUserId: admin as unknown as string },
    });

    expect(result.processedCount).toBe(0);
    const rows = await container.db.select().from(schema.searchDocuments);
    expect(rows).toHaveLength(0);
  });

  it("rebuilds active notes across multiple users and excludes trashed ones", async () => {
    const container = getContainer();
    const admin = await seedUser(container, { role: "admin" });
    const dirA = await seedDirectory(container, admin);

    const member = await seedUser(container, { role: "member" });
    const dirB = await seedDirectory(container, member);

    const adminActive = await seedNote(container, {
      ownerId: admin,
      directoryId: dirA,
      title: "Hello design",
    });
    const adminTrashed = await seedNote(container, {
      ownerId: admin,
      directoryId: dirA,
      status: "trashed",
      title: "Old trashed",
    });
    const memberPublic = await seedNote(container, {
      ownerId: member,
      directoryId: dirB,
      title: "Public note",
    });
    const memberPrivate = await seedNote(container, {
      ownerId: member,
      directoryId: dirB,
      title: "Private note",
    });

    await seedPublicationState(container, {
      noteId: memberPublic,
      ownerId: member,
      visibility: "public",
    });
    // memberPrivate has no publication_states row → falls back to 'private'.

    const result = await rebuildSearchIndex({
      container,
      input: { actorUserId: admin as unknown as string },
    });

    expect(result.processedCount).toBe(3);

    const rows = await container.db.select().from(schema.searchDocuments);
    const byNoteId = new Map(rows.map((r) => [r.noteId, r]));
    expect(byNoteId.has(adminActive)).toBe(true);
    expect(byNoteId.has(memberPublic)).toBe(true);
    expect(byNoteId.has(memberPrivate)).toBe(true);
    expect(byNoteId.has(adminTrashed)).toBe(false);

    expect(byNoteId.get(memberPublic)?.visibility).toBe("public");
    expect(byNoteId.get(memberPrivate)?.visibility).toBe("private");

    // Snapshot projection content (per review T-W-003): tag_names_json,
    // directory_path, body_plain and title must all flow through the
    // batched `buildNoteSnapshots`.
    const memberPublicRow = byNoteId.get(memberPublic);
    expect(memberPublicRow?.title).toBe("Public note");
    expect(memberPublicRow?.bodyPlain).toBe("body");
    expect(memberPublicRow?.tagNamesJson).toBe("[]");
    expect(memberPublicRow?.directoryPath).toBe("/");

    // Smoke the FTS index by querying for a known term.
    const queryResult = await container.searchIndex.query(
      SearchQuery.create({
        keyword: SearchKeyword.create("design") as unknown as string,
        ownerIdFilter: null,
        visibilityFilter: ["private", "unlisted", "public"],
        tagNames: [],
        directoryPathPrefix: null,
        dateRange: null,
        limit: 10,
        cursor: null,
      }),
    );
    expect(queryResult.hits.some((h) => h.noteId === adminActive)).toBe(true);
  });

  it("projects nested directory paths via DirectoryService.computePath", async () => {
    const container = getContainer();
    const admin = await seedUser(container, { role: "admin" });
    const root = await seedDirectory(container, admin);
    const parent = await seedDirectory(container, admin, {
      parentId: root,
      name: "parent",
      slug: "parent",
      depth: 1,
    });
    const child = await seedDirectory(container, admin, {
      parentId: parent,
      name: "child",
      slug: "child",
      depth: 2,
    });

    const rootNote = await seedNote(container, {
      ownerId: admin,
      directoryId: root,
      title: "at-root",
    });
    const childNote = await seedNote(container, {
      ownerId: admin,
      directoryId: child,
      title: "in-child",
    });

    await rebuildSearchIndex({
      container,
      input: { actorUserId: admin as unknown as string },
    });

    const rows = await container.db.select().from(schema.searchDocuments);
    const byId = new Map(rows.map((r) => [r.noteId, r]));
    expect(byId.get(rootNote)?.directoryPath).toBe("/");
    expect(byId.get(childNote)?.directoryPath).toBe("/parent/child");
  });

  it("treats frontMatter['date'] as the calendar date when valid", async () => {
    const container = getContainer();
    const admin = await seedUser(container, { role: "admin" });
    const dir = await seedDirectory(container, admin);

    const withDate = await seedNote(container, {
      ownerId: admin,
      directoryId: dir,
      title: "with date",
      frontMatter: JSON.stringify({ date: "2026-03-14T00:00:00.000Z" }),
    });
    const withInvalid = await seedNote(container, {
      ownerId: admin,
      directoryId: dir,
      title: "with invalid",
      frontMatter: JSON.stringify({ date: "not a date" }),
    });

    await rebuildSearchIndex({
      container,
      input: { actorUserId: admin as unknown as string },
    });

    const rows = await container.db.select().from(schema.searchDocuments);
    const byId = new Map(rows.map((r) => [r.noteId, r]));
    expect(byId.get(withDate)?.dateForCalendar).toBe(
      "2026-03-14T00:00:00.000Z",
    );
    // Invalid → falls back to updatedAt (seeded TZ).
    expect(byId.get(withInvalid)?.dateForCalendar).toBe(TZ);
  });
});
