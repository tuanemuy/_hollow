import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { searchInternalLinkTargets } from "../searchInternalLinkTargets";

// spec: .issue/36/plan.md §14-b

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7e0-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x0a);
  await container.db.insert(schema.users).values({
    id,
    name: "T",
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: TZ,
    updatedAt: TZ,
    username: `u-${id.slice(9, 13)}`,
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
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id as DirectoryId;
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: { title: string; status?: "active" | "trashed" },
): Promise<NoteId> {
  const id = nextId(0x0c);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: opts.title,
    contentHtml: "<p>seed</p>",
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

async function seedTag(
  container: TestContainer,
  ownerId: UserId,
  name: string,
): Promise<TagId> {
  const id = nextId(0x0d);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name.toLowerCase(),
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id as TagId;
}

describe("searchInternalLinkTargets (integration)", () => {
  const getContainer = setupTestContainer();

  it("returns notes owned by the actor whose title matches by prefix", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "Alpha" });
    await seedNote(container, owner, dir, { title: "Alphabet" });
    await seedNote(container, owner, dir, { title: "Beta" });

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "alph" },
    });
    const titles = suggestions
      .filter((s) => s.kind === "note")
      .map((s) => (s.kind === "note" ? s.title : ""));
    expect(titles).toEqual(["Alpha", "Alphabet"]);
  });

  it("excludes notes owned by other users", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const ownerDir = await seedDirectory(container, owner);
    const strangerDir = await seedDirectory(container, stranger);
    await seedNote(container, owner, ownerDir, { title: "Foo Owned" });
    await seedNote(container, stranger, strangerDir, { title: "Foo Stranger" });

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "Foo" },
    });
    const titles = suggestions
      .filter((s) => s.kind === "note")
      .map((s) => (s.kind === "note" ? s.title : ""));
    expect(titles).toEqual(["Foo Owned"]);
  });

  it("excludes trashed notes", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "Active Doc" });
    await seedNote(container, owner, dir, {
      title: "Active Trash",
      status: "trashed",
    });

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "Active" },
    });
    const titles = suggestions
      .filter((s) => s.kind === "note")
      .map((s) => (s.kind === "note" ? s.title : ""));
    expect(titles).toEqual(["Active Doc"]);
  });

  it("returns tags owned by the actor whose name matches by prefix", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    await seedTag(container, owner, "draft");
    await seedTag(container, owner, "drama");
    await seedTag(container, owner, "idea");

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "dr" },
    });
    const names = suggestions
      .filter((s) => s.kind === "tag")
      .map((s) => (s.kind === "tag" ? s.name : ""));
    expect(names).toEqual(["draft", "drama"]);
  });

  it("excludes tags owned by other users", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    await seedTag(container, owner, "alpha-mine");
    await seedTag(container, stranger, "alpha-theirs");

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "alpha" },
    });
    const names = suggestions
      .filter((s) => s.kind === "tag")
      .map((s) => (s.kind === "tag" ? s.name : ""));
    expect(names).toEqual(["alpha-mine"]);
  });

  it("returns an empty list for an empty query", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "Anything" });
    await seedTag(container, owner, "draft");

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "   " },
    });
    expect(suggestions).toEqual([]);
  });

  it("truncates the merged list to `limit`, notes first", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // 3 notes + 2 tags all matching prefix `x`, limit 4 → 3 notes + 1 tag
    await seedNote(container, owner, dir, { title: "xa" });
    await seedNote(container, owner, dir, { title: "xb" });
    await seedNote(container, owner, dir, { title: "xc" });
    await seedTag(container, owner, "xtag1");
    await seedTag(container, owner, "xtag2");

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "x", limit: 4 },
    });
    expect(suggestions.length).toBe(4);
    expect(suggestions.slice(0, 3).every((s) => s.kind === "note")).toBe(true);
    expect(suggestions[3].kind).toBe("tag");
  });

  it("filters out notes whose title contains `[`, `]`, or `|` (ADR-008)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "foo plain" });
    await seedNote(container, owner, dir, { title: "foo|bar" });
    await seedNote(container, owner, dir, { title: "foo [draft]" });
    await seedNote(container, owner, dir, { title: "foo]bar" });

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "foo" },
    });
    const titles = suggestions
      .filter((s) => s.kind === "note")
      .map((s) => (s.kind === "note" ? s.title : ""));
    expect(titles).toEqual(["foo plain"]);
  });

  it("does not let tags backfill the cap when notes already fill it", async () => {
    // ADR-005 pins the merge as "all matching notes first, then tags
    // until the cap is hit". When five notes hit the prefix and the
    // cap is four, every slot is consumed by notes and the two tags
    // get dropped — verified here so future ranking experiments don't
    // silently violate the contract.
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "ya" });
    await seedNote(container, owner, dir, { title: "yb" });
    await seedNote(container, owner, dir, { title: "yc" });
    await seedNote(container, owner, dir, { title: "yd" });
    await seedNote(container, owner, dir, { title: "ye" });
    await seedTag(container, owner, "ytag1");
    await seedTag(container, owner, "ytag2");

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "y", limit: 4 },
    });
    expect(suggestions.length).toBe(4);
    expect(suggestions.every((s) => s.kind === "note")).toBe(true);
  });

  it("does not backfill ADR-008-excluded note slots from the tag pool", async () => {
    // When every note matching the prefix is filtered out by ADR-008
    // (boundary chars in the title), the cap is not topped up from
    // the tag pool — the result is intentionally shorter than `limit`.
    // Pin the observable behaviour so a future "let tags fill the
    // gap" change is a deliberate decision.
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    await seedNote(container, owner, dir, { title: "z|a" });
    await seedNote(container, owner, dir, { title: "z|b" });
    await seedTag(container, owner, "ztag1");
    await seedTag(container, owner, "ztag2");
    await seedTag(container, owner, "ztag3");

    const { suggestions } = await searchInternalLinkTargets({
      container,
      input: { actorUserId: owner, query: "z", limit: 5 },
    });
    expect(suggestions.length).toBe(3);
    expect(suggestions.every((s) => s.kind === "tag")).toBe(true);
  });
});
