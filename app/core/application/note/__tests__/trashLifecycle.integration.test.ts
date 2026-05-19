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
import { deleteNote } from "../deleteNote";
import { purgeNote } from "../purgeNote";
import { purgeTrashOlderThan } from "../purgeTrashOlderThan";
import { restoreNote } from "../restoreNote";

// spec: spec/testcases/note/index.md#DeleteNote / RestoreNote / PurgeNote / PurgeTrashOlderThan

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d5-${block}-7000-8000-0000000000${tail}`;
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
  opts: {
    slug?: string;
    status?: "active" | "trashed";
    trashedAt?: Date | null;
  } = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: opts.slug ?? `n-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml: "<p>seed</p>",
    frontMatterJson: "{}",
    status,
    trashedAt:
      status === "trashed"
        ? (opts.trashedAt ?? new Date(TZ)).toISOString()
        : null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id as NoteId;
}

function withFixedClock(c: TestContainer, t: Date): TestContainer {
  return { ...c, clock: { now: () => t } };
}

describe("deleteNote (integration)", () => {
  // spec: spec/testcases/note/index.md#DeleteNote
  const getContainer = setupTestContainer();

  // ADR-004 #16: spec wording uses `note.deleted` but the implementation
  // emits `note.trashed` (status change, not removal). Tests pin the
  // implementation type until Phase 4 reconciles the spec text.
  it("transitions an active note to trashed and emits a note.trashed outbox event", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    const before = await container.db.select().from(schema.outboxEvents);
    await deleteNote({
      container,
      input: { actorUserId: owner, noteId },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.status).toBe("trashed");
    expect(rows[0]?.trashedAt).not.toBeNull();

    const after = await container.db.select().from(schema.outboxEvents);
    const added = after.filter((e) => !before.some((b) => b.id === e.id));
    const trashedEvents = added.filter((e) => e.eventType === "note.trashed");
    expect(trashedEvents).toHaveLength(1);
    expect(trashedEvents[0]?.aggregateId).toBe(noteId);
    // No accidental emission of other note.* types.
    expect(added.every((e) => e.eventType === "note.trashed")).toBe(true);
  });

  it("throws BusinessRuleError(AlreadyTrashed) when the note is already trashed", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    try {
      await deleteNote({
        container,
        input: { actorUserId: owner, noteId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.AlreadyTrashed);
    }
  });
});

describe("restoreNote (integration)", () => {
  // spec: spec/testcases/note/index.md#DeleteNote / RestoreNote ...
  const getContainer = setupTestContainer();

  // ADR-004 #17: spec wording uses `note.saved` for restoration but the
  // implementation emits `note.restored`. Tests pin the implementation
  // type until Phase 4 reconciles the spec text.
  it("restores a trashed note to active and emits a note.restored outbox event", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    const before = await container.db.select().from(schema.outboxEvents);
    const { note } = await restoreNote({
      container,
      input: { actorUserId: owner, noteId, restoreDirectoryId: dir },
    });
    expect(note.status).toBe("active");

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.trashedAt).toBeNull();

    const after = await container.db.select().from(schema.outboxEvents);
    const added = after.filter((e) => !before.some((b) => b.id === e.id));
    const restored = added.filter((e) => e.eventType === "note.restored");
    expect(restored).toHaveLength(1);
    expect(restored[0]?.aggregateId).toBe(noteId);
    // No accidental emission of other note.* types.
    expect(added.every((e) => e.eventType === "note.restored")).toBe(true);
  });

  it("throws BusinessRuleError(NotTrashed) when restoring an already-active note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    try {
      await restoreNote({
        container,
        input: { actorUserId: owner, noteId, restoreDirectoryId: dir },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.NotTrashed);
    }
  });

  // Issue #42: with `uniq_notes_owner_slug` narrowed to `WHERE
  // status='active'`, an active note and a trashed note can share the
  // same `(ownerId, slug)`. `RestoreNote` now pre-checks slug collisions
  // via `assertSlugUnique` and surfaces them as `SlugConflict`.
  it("rejects restoration when the slug collides with another active note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const trashedId = await seedNote(container, owner, dir, {
      slug: "shared",
      status: "trashed",
    });
    await seedNote(container, owner, dir, {
      slug: "shared",
      status: "active",
    });

    try {
      await restoreNote({
        container,
        input: {
          actorUserId: owner,
          noteId: trashedId,
          restoreDirectoryId: dir,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.SlugConflict);
    }

    // The transaction must have rolled back — the trashed note should
    // still be trashed (symmetrical to the count-based assertion in
    // `duplicateNote.integration.test.ts`).
    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, trashedId as unknown as string));
    expect(rows[0]?.status).toBe("trashed");
    expect(rows[0]?.trashedAt).not.toBeNull();
  });
});

describe("purgeNote (integration)", () => {
  // spec: spec/testcases/note/index.md#DeleteNote / RestoreNote / PurgeNote ...
  const getContainer = setupTestContainer();

  it("physically deletes a trashed note and emits a note.purged event", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, { status: "trashed" });

    const before = await container.db.select().from(schema.outboxEvents);
    await purgeNote({
      container,
      input: { actorUserId: owner, noteId },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows).toHaveLength(0);

    const after = await container.db.select().from(schema.outboxEvents);
    const added = after.filter((e) => !before.some((b) => b.id === e.id));
    const purged = added.filter((e) => e.eventType === "note.purged");
    expect(purged).toHaveLength(1);
    expect(purged[0]?.aggregateId).toBe(noteId);
  });
});

describe("purgeTrashOlderThan (integration)", () => {
  // spec: spec/testcases/note/index.md#DeleteNote / RestoreNote / PurgeNote / PurgeTrashOlderThan
  const getContainer = setupTestContainer();

  it("purges trashed notes older than the retention window and leaves newer trash intact", async () => {
    const baseContainer = getContainer();
    const owner = await seedUser(baseContainer);
    const dir = await seedDirectory(baseContainer, owner);
    const now = new Date("2026-06-01T00:00:00.000Z");
    const stale = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    const fresh = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const oldId = await seedNote(baseContainer, owner, dir, {
      slug: "old",
      status: "trashed",
      trashedAt: stale,
    });
    const freshId = await seedNote(baseContainer, owner, dir, {
      slug: "fresh",
      status: "trashed",
      trashedAt: fresh,
    });

    const container = withFixedClock(baseContainer, now);
    const { purgedCount } = await purgeTrashOlderThan({
      container,
      input: { actorUserId: owner, retentionDays: 30 },
    });
    expect(purgedCount).toBe(1);

    const remaining = await container.db.select().from(schema.notes);
    const remainingIds = remaining.map((r) => r.id);
    expect(remainingIds).not.toContain(oldId);
    expect(remainingIds).toContain(freshId);
  });
});
