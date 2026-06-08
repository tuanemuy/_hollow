import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { getBacklinks } from "../getBacklinks";
import { getNoteDetail } from "../getNoteDetail";

// spec: spec/testcases/note/index.md#GetNoteDetail / GetBacklinks

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d7-${block}-7000-8000-0000000000${tail}`;
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

async function seedChildDirectory(
  container: TestContainer,
  ownerId: UserId,
  parent: { id: DirectoryId; depth: number },
  name: string,
): Promise<{ id: DirectoryId; depth: number }> {
  const id = nextId(0x0b);
  const depth = parent.depth + 1;
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: parent.id,
    name,
    slug: `d-${id.slice(9, 13)}`,
    depth,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return { id: id as DirectoryId, depth };
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: {
    status?: "active" | "trashed";
    contentHtml?: string;
    sourceFileId?: string | null;
  } = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml: opts.contentHtml ?? "<p>seed</p>",
    frontMatterJson: "{}",
    status,
    trashedAt: status === "trashed" ? TZ : null,
    sourceFileId: opts.sourceFileId ?? null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id as NoteId;
}

async function seedSourceMedia(
  container: TestContainer,
  ownerId: UserId,
  opts: { originalFileName?: string | null; mimeType?: string } = {},
): Promise<string> {
  const id = nextId(0x0e);
  await container.db.insert(schema.mediaAssets).values({
    id,
    ownerId,
    kind: "source",
    mimeType: opts.mimeType ?? "application/pdf",
    byteSize: 4,
    backend: "r2",
    storageKey: `${ownerId}/source/${id}`,
    originalFileName: opts.originalFileName ?? "report.pdf",
    width: null,
    height: null,
    durationMs: null,
    refCount: 1,
    status: "attached",
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedInternalLink(
  container: TestContainer,
  fromNoteId: NoteId,
  resolvedNoteId: NoteId,
  opts: { displayText?: string | null } = {},
): Promise<void> {
  const id = nextId(0x0d);
  await container.db.insert(schema.noteInternalLinks).values({
    id,
    fromNoteId,
    refKind: "id",
    refTarget: resolvedNoteId,
    displayText: opts.displayText ?? null,
    resolvedNoteId,
  });
}

describe("getNoteDetail (integration)", () => {
  // spec: spec/testcases/note/index.md#GetNoteDetail
  const getContainer = setupTestContainer();

  it("returns the NoteDTO, backlinks list, and directoryPath for the caller's own note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir);
    await seedInternalLink(container, referrer, noteId);

    const { note, backlinks, backlinkCount, directoryPath } =
      await getNoteDetail({
        container,
        input: { actorUserId: owner, noteId },
      });
    expect(note.id).toBe(noteId);
    expect(backlinks.map((b) => b.noteId as string)).toContain(referrer);
    expect(backlinkCount).toBe(1);
    expect(typeof directoryPath).toBe("string");
  });

  // Issue #452: when the note carries a persistent source file, the
  // detail projection synthesises a `sourceFile` DTO whose fields match
  // the bound MediaAsset.
  it("projects sourceFile (mediaId/originalFileName) when the note has a bound source", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const sourceFileId = await seedSourceMedia(container, owner, {
      originalFileName: "資料.pdf",
      mimeType: "application/pdf",
    });
    const noteId = await seedNote(container, owner, dir, { sourceFileId });

    const { note } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(note.sourceFile).not.toBeNull();
    expect(note.sourceFile?.mediaId as string).toBe(sourceFileId);
    expect(note.sourceFile?.originalFileName).toBe("資料.pdf");
  });

  it("projects sourceFile === null when the note has no bound source", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    const { note } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(note.sourceFile).toBeNull();
  });

  // T-detail-preview: with more referrers than the preview
  // limit (5), `backlinks` is capped at the preview size while
  // `backlinkCount` reports the exact total.
  it("caps the inline backlinks preview at the preview limit while reporting the full backlinkCount", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    for (let i = 0; i < 8; i += 1) {
      const referrer = await seedNote(container, owner, dir);
      await seedInternalLink(container, referrer, noteId);
    }

    const { backlinks, backlinkCount } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(backlinks).toHaveLength(5);
    expect(backlinkCount).toBe(8);
  });

  // T-detail-count: backlinkCount is exact for 0 / 1 / N.
  it("reports backlinkCount === 0 when the note has no referrers", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    const { backlinks, backlinkCount } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(backlinks).toHaveLength(0);
    expect(backlinkCount).toBe(0);
  });

  it("reports the exact backlinkCount for a referrer count within the preview limit", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    for (let i = 0; i < 3; i += 1) {
      const referrer = await seedNote(container, owner, dir);
      await seedInternalLink(container, referrer, noteId);
    }

    const { backlinks, backlinkCount } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(backlinks).toHaveLength(3);
    expect(backlinkCount).toBe(3);
  });

  // T-detail-count-trashed: trashed referrers stay in both
  // the count and the preview population — neither side applies a status
  // filter, so the two share the same set (status-scope regression).
  it("includes trashed referrers in both the backlinkCount and the preview population", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const activeReferrer = await seedNote(container, owner, dir);
    const trashedReferrer = await seedNote(container, owner, dir, {
      status: "trashed",
    });
    await seedInternalLink(container, activeReferrer, noteId);
    await seedInternalLink(container, trashedReferrer, noteId);

    const { backlinks, backlinkCount } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(backlinkCount).toBe(2);
    const ids = backlinks.map((b) => b.noteId as string);
    expect(ids).toContain(activeReferrer);
    expect(ids).toContain(trashedReferrer);
  });

  it("returns directorySegments root→leaf with {id,name} for a nested directory", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const parent = await seedChildDirectory(
      container,
      owner,
      { id: root, depth: 0 },
      "parent",
    );
    const child = await seedChildDirectory(container, owner, parent, "child");
    const noteId = await seedNote(container, owner, child.id);

    const { directorySegments } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(directorySegments).toEqual([
      { id: parent.id as string, name: "parent" },
      { id: child.id as string, name: "child" },
    ]);
  });

  it("returns the referrer's directorySegments on each BacklinkDTO", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, root);
    // Referrer lives in root/parent/child; its backlink card shows that path.
    const parent = await seedChildDirectory(
      container,
      owner,
      { id: root, depth: 0 },
      "Research",
    );
    const child = await seedChildDirectory(
      container,
      owner,
      parent,
      "書籍要約",
    );
    const referrer = await seedNote(container, owner, child.id);
    await seedInternalLink(container, referrer, noteId);
    // A second referrer at root level has empty segments.
    const rootReferrer = await seedNote(container, owner, root);
    await seedInternalLink(container, rootReferrer, noteId);

    const { backlinks } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    const nested = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(nested?.directorySegments).toEqual([
      { id: parent.id as string, name: "Research" },
      { id: child.id as string, name: "書籍要約" },
    ]);
    const atRoot = backlinks.find((b) => (b.noteId as string) === rootReferrer);
    expect(atRoot?.directorySegments).toEqual([]);
  });

  it("renders [[wikilink]] / #hashtag markup in renderedContentHtml while leaving contentHtml verbatim", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      contentHtml: "<p>[[未解決]] #design</p>",
    });

    const { note, renderedContentHtml } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(note.contentHtml).toBe("<p>[[未解決]] #design</p>");
    expect(renderedContentHtml).toContain(
      '<span class="wikilink" data-unresolved>未解決</span>',
    );
    // auth surface (#556): #hashtag links to the home tag filter using the
    // JSON-array `?tagNames=["design"]` form that TanStack's default parser
    // accepts.
    expect(renderedContentHtml).toContain(
      '<a class="hashtag" href="/?tagNames=%5B%22design%22%5D">#design</a>',
    );
  });

  // Test W-001: end-to-end coverage for a *resolved* wikilink. A's body holds
  // `[[<B's id>]]` and a seeded internal link (resolved_note_id = B) supplies
  // the resolvedNoteId. This verifies the wiring entity.internalLinkRefs →
  // renderer (resolvedNoteId reaches the renderer through DI), which the
  // unresolved-span case above cannot exercise.
  it("renders a resolved [[id]] wikilink as a linking <a> in renderedContentHtml", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir);
    const noteId = await seedNote(container, owner, dir, {
      contentHtml: `<p>関連: [[${target}]] を参照</p>`,
    });
    await seedInternalLink(container, noteId, target);

    const { note, renderedContentHtml } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(note.contentHtml).toBe(`<p>関連: [[${target}]] を参照</p>`);
    expect(renderedContentHtml).toContain(
      `<a class="wikilink" href="/notes/${target}">`,
    );
  });

  // Test W-001 (variant): a resolved id-keyed wikilink with an inline display
  // segment `[[<id>|表示名]]` renders the display label, not the raw UUID.
  it("renders a resolved [[id|display]] wikilink with the display label", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir);
    const noteId = await seedNote(container, owner, dir, {
      contentHtml: `<p>[[${target}|表示名]]</p>`,
    });
    await seedInternalLink(container, noteId, target, {
      displayText: "表示名",
    });

    const { renderedContentHtml } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(renderedContentHtml).toContain(
      `<a class="wikilink" href="/notes/${target}">表示名</a>`,
    );
  });

  it("returns an empty directorySegments array for a root-level note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, root);

    const { directorySegments } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(directorySegments).toEqual([]);
  });

  it("derives each backlink snippet from the referrer body's plaintext head", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir, {
      contentHtml: "<p>referrer body excerpt</p>",
    });
    await seedInternalLink(container, referrer, noteId);

    const { backlinks } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.snippet).toBe("referrer body excerpt");
  });

  it("yields a null backlink snippet when the referrer body sanitises to empty text", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir, {
      contentHtml: "<p></p>",
    });
    await seedInternalLink(container, referrer, noteId);

    const { backlinks } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.snippet).toBeNull();
  });

  it("caps the backlink snippet at 200 characters for a long referrer body", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir, {
      contentHtml: `<p>${"a".repeat(250)}</p>`,
    });
    await seedInternalLink(container, referrer, noteId);

    const { backlinks } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.snippet?.length).toBe(200);
  });

  it("throws ForbiddenError when the caller is not the note owner", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    try {
      await getNoteDetail({
        container,
        input: { actorUserId: stranger, noteId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isForbiddenError(error)) {
        throw error;
      }
      expect(error.code).toBe("NOTE_FORBIDDEN");
    }
  });

  it("still returns a trashed note (UI suppresses lock controls, but the read path remains open)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    const { note } = await getNoteDetail({
      container,
      input: { actorUserId: owner, noteId },
    });
    expect(note.id).toBe(noteId);
    expect(note.status).toBe("trashed");
  });

  it("throws NotFoundError when the note does not exist", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const missing = nextId(0x0c) as NoteId;

    try {
      await getNoteDetail({
        container,
        input: { actorUserId: owner, noteId: missing },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      expect(error.code).toBe("NOTE_NOT_FOUND");
    }
  });
});

describe("getBacklinks (integration)", () => {
  // spec: spec/testcases/note/index.md#GetNoteDetail / GetBacklinks
  const getContainer = setupTestContainer();

  it("returns each referencing note as a BacklinkDTO whose noteId matches the referrer", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir);
    const referrer1 = await seedNote(container, owner, dir);
    const referrer2 = await seedNote(container, owner, dir);
    await seedNote(container, owner, dir); // unrelated
    await seedInternalLink(container, referrer1, target);
    await seedInternalLink(container, referrer2, target);

    const { backlinks } = await getBacklinks({
      container,
      input: { actorUserId: owner, noteId: target },
    });
    const ids = backlinks.map((b) => b.noteId as string).sort();
    expect(ids).toEqual([referrer1, referrer2].sort());
  });

  it("derives each backlink snippet from the referrer body's plaintext", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, dir);
    const referrer = await seedNote(container, owner, dir, {
      contentHtml: "<p>referrer body excerpt</p>",
    });
    await seedInternalLink(container, referrer, target);

    const { backlinks } = await getBacklinks({
      container,
      input: { actorUserId: owner, noteId: target },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.snippet).toBe("referrer body excerpt");
  });

  it("projects the referrer's directorySegments root→leaf", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const root = await seedDirectory(container, owner);
    const target = await seedNote(container, owner, root);
    const parent = await seedChildDirectory(
      container,
      owner,
      { id: root, depth: 0 },
      "日記",
    );
    const child = await seedChildDirectory(container, owner, parent, "2026");
    const referrer = await seedNote(container, owner, child.id);
    await seedInternalLink(container, referrer, target);

    const { backlinks } = await getBacklinks({
      container,
      input: { actorUserId: owner, noteId: target },
    });
    const bl = backlinks.find((b) => (b.noteId as string) === referrer);
    expect(bl?.directorySegments).toEqual([
      { id: parent.id as string, name: "日記" },
      { id: child.id as string, name: "2026" },
    ]);
  });
});
