import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import type { NoteId } from "@/core/domain/note/valueObject";
import { saveNote } from "../saveNote";

// spec: spec/testcases/note/index.md#SaveNote

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d1-${block}-7000-8000-0000000000${tail}`;
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

type SeedNoteOpts = Readonly<{
  status?: "active" | "trashed";
  title?: string;
  contentHtml?: string;
  tagIds?: readonly string[];
  editLockUserId?: UserId | null;
  editLockAcquiredAt?: Date | null;
  editLockExpiresAt?: Date | null;
  mediaIds?: readonly string[];
}>;

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: SeedNoteOpts = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: opts.title ?? "seeded",
    contentHtml: opts.contentHtml ?? "<p>seed</p>",
    frontMatterJson: "{}",
    status,
    trashedAt: status === "trashed" ? TZ : null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: opts.editLockUserId ?? null,
    editLockAcquiredAt: opts.editLockUserId
      ? (opts.editLockAcquiredAt ?? lockAcquiredAt()).toISOString()
      : null,
    editLockExpiresAt: opts.editLockExpiresAt
      ? opts.editLockExpiresAt.toISOString()
      : null,
    version: 0,
  });
  for (const tagId of opts.tagIds ?? []) {
    await container.db.insert(schema.noteTags).values({ noteId: id, tagId });
  }
  for (const mediaId of opts.mediaIds ?? []) {
    await container.db
      .insert(schema.noteMediaRefs)
      .values({ noteId: id, mediaId });
  }
  return id as NoteId;
}

async function seedTag(
  container: TestContainer,
  ownerId: UserId,
  name: string,
  noteCount = 1,
): Promise<string> {
  const id = nextId(0x0d);
  await container.db.insert(schema.tags).values({
    id,
    ownerId,
    name,
    nameNormalized: name,
    noteCount,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedMediaAsset(
  container: TestContainer,
  ownerId: UserId,
  opts: { status?: "pending" | "attached"; refCount?: number } = {},
): Promise<string> {
  const id = nextId(0x0e);
  const status = opts.status ?? "pending";
  await container.db.insert(schema.mediaAssets).values({
    id,
    ownerId,
    kind: "image",
    mimeType: "image/png",
    byteSize: 1024,
    backend: "r2",
    storageKey: `media/${id}`,
    refCount: opts.refCount ?? (status === "attached" ? 1 : 0),
    status,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

// Lock expiry must respect EditLock's 30-minute TTL ceiling enforced by
// the value object on rehydration AND must be "live" against the real
// clock the usecase reads (`container.clock.now()` = `SystemClock`).
// Use 25 minutes from `Date.now()` so the lock is current at test time.
const farFuture = (): Date => new Date(Date.now() + 25 * 60 * 1000);
const lockAcquiredAt = (): Date => new Date(Date.now() - 1000);

describe("saveNote (integration)", () => {
  // spec: spec/testcases/note/index.md#SaveNote
  const getContainer = setupTestContainer();

  it("commits the update when the caller holds the lock and requireLock=true", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: owner,
      editLockExpiresAt: farFuture(),
    });

    const { note } = await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        title: "renamed-in-save",
        requireLock: true,
      },
    });

    expect(note.title).toBe("renamed-in-save");
    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.title).toBe("renamed-in-save");
    expect(rows[0]?.version).toBe(1);
  });

  it("throws BusinessRuleError(EditLockedByOther) when another user holds the lock and requireLock=true", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: stranger,
      editLockExpiresAt: farFuture(),
    });

    try {
      await saveNote({
        container,
        input: {
          actorUserId: owner,
          noteId,
          title: "blocked",
          requireLock: true,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.EditLockedByOther);
    }
  });

  it("throws BusinessRuleError(EditLockedByOther) when another user holds the lock even with requireLock=false", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: stranger,
      editLockExpiresAt: farFuture(),
    });

    try {
      await saveNote({
        container,
        input: {
          actorUserId: owner,
          noteId,
          title: "blocked-too",
          requireLock: false,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.EditLockedByOther);
    }
  });

  it("commits when no lock is held and requireLock=false", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    const { note } = await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        title: "unlocked-save",
        requireLock: false,
      },
    });
    expect(note.title).toBe("unlocked-save");
  });

  it("throws BusinessRuleError(AlreadyTrashed) when the note is trashed", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    try {
      await saveNote({
        container,
        input: {
          actorUserId: owner,
          noteId,
          title: "nope",
          requireLock: false,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.AlreadyTrashed);
    }
  });

  it("adds tags from the body and persists the resulting note_tags links", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        contentHtml: "<p>body with #fresh tag</p>",
        requireLock: false,
      },
    });

    const tags = await container.db.select().from(schema.tags);
    expect(tags.map((t) => t.name)).toContain("fresh");

    const links = await container.db
      .select()
      .from(schema.noteTags)
      .where(eq(schema.noteTags.noteId, noteId as unknown as string));
    expect(links).toHaveLength(1);
  });

  it("removes obsolete note_tags links when the body no longer references the tag", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const tagId = await seedTag(container, owner, "stale", 1);
    const noteId = await seedNote(container, owner, dir, {
      contentHtml: "<p>body with #stale tag</p>",
      tagIds: [tagId],
    });

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        contentHtml: "<p>plain body</p>",
        requireLock: false,
      },
    });

    const links = await container.db
      .select()
      .from(schema.noteTags)
      .where(eq(schema.noteTags.noteId, noteId as unknown as string));
    expect(links).toHaveLength(0);
  });

  // Issue #158: every successful SaveNote appends a revision row.
  it("appends a note_revisions row reflecting the saved state", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        title: "saved-title",
        contentHtml: "<p>saved body</p>",
        requireLock: false,
      },
    });

    const rows = await container.db
      .select()
      .from(schema.noteRevisions)
      .where(eq(schema.noteRevisions.noteId, noteId as unknown as string));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("saved-title");
    expect(rows[0]?.contentHtml).toContain("saved body");
    expect(rows[0]?.ownerId).toBe(owner);
    expect(rows[0]?.createdByUserId).toBe(owner);
  });

  it("prunes the oldest revision when the per-note ceiling is exceeded", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    // Lower the retention ceiling to 2 for this test so we don't need
    // 50 saves to observe pruning.
    await container.unitOfWorkProvider.run(async (ctx) => {
      const { entity, expectedVersion } =
        await ctx.instanceSettingsRepository.get();
      const next = {
        ...entity,
        limits: {
          ...entity.limits,
          maxNoteRevisionsPerNote: 2,
        },
        version: entity.version + 1,
        updatedAt: new Date(),
      } as typeof entity;
      await ctx.instanceSettingsRepository.save(next, expectedVersion);
    });

    for (let i = 0; i < 3; i += 1) {
      await saveNote({
        container,
        input: {
          actorUserId: owner,
          noteId,
          contentHtml: `<p>v${i + 1}</p>`,
          requireLock: false,
        },
      });
    }

    const rows = await container.db
      .select()
      .from(schema.noteRevisions)
      .where(eq(schema.noteRevisions.noteId, noteId as unknown as string));
    expect(rows).toHaveLength(2);
  });

  it("bumps the media ref-count for newly-added body media via reconcileRefs", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const mediaId = await seedMediaAsset(container, owner, {
      status: "pending",
      refCount: 0,
    });
    const noteId = await seedNote(container, owner, dir);

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId,
        contentHtml: `<p><img src="/media/${mediaId}" alt="x" /></p>`,
        requireLock: false,
      },
    });

    const rows = await container.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, mediaId));
    expect(rows[0]?.refCount).toBe(1);
    expect(rows[0]?.status).toBe("attached");
  });

  // Issue #127: saving a body that contains `[[Existing Title]]` resolves
  // the link to the target note id; a `[[own title]]` link does not
  // self-resolve (ADR-005).
  it("resolves [[Existing Title]] on save and excludes a self-reference", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const targetId = await seedNote(container, owner, dir, {
      title: "Target Note",
    });
    const editorId = await seedNote(container, owner, dir, {
      title: "Editor",
    });

    await saveNote({
      container,
      input: {
        actorUserId: owner,
        noteId: editorId,
        contentHtml: "<p>link to [[target note]] and [[Editor]]</p>",
        requireLock: false,
      },
    });

    const links = await container.db
      .select()
      .from(schema.noteInternalLinks)
      .where(
        eq(schema.noteInternalLinks.fromNoteId, editorId as unknown as string),
      );
    const byTarget = new Map(links.map((l) => [l.refTarget, l.resolvedNoteId]));
    expect(byTarget.get("target note")).toBe(targetId as unknown as string);
    // Self-reference stays unresolved.
    expect(byTarget.get("Editor")).toBeNull();

    const referrers = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findReferrers(targetId),
    );
    expect(referrers.map((n) => n.id)).toContain(editorId);

    const selfReferrers = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) => noteRepository.findReferrers(editorId),
    );
    expect(selfReferrers).toHaveLength(0);
  });
});
