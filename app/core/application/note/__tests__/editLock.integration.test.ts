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
import { acquireEditLock } from "../acquireEditLock";
import { extendEditLock } from "../extendEditLock";
import { releaseEditLock } from "../releaseEditLock";

// spec: spec/testcases/note/index.md#AcquireEditLock / ExtendEditLock / ReleaseEditLock

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();
const TTL_SEC = 60 * 10; // 10 minutes — within the 30-min ceiling.

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d6-${block}-7000-8000-0000000000${tail}`;
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
  editLockUserId?: UserId | null;
  editLockAcquiredAt?: Date | null;
  editLockExpiresAt?: Date | null;
}>;

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
  opts: SeedNoteOpts = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml: "<p>seed</p>",
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: opts.editLockUserId ?? null,
    editLockAcquiredAt: opts.editLockAcquiredAt
      ? opts.editLockAcquiredAt.toISOString()
      : null,
    editLockExpiresAt: opts.editLockExpiresAt
      ? opts.editLockExpiresAt.toISOString()
      : null,
    version: 0,
  });
  return id as NoteId;
}

describe("acquireEditLock (integration)", () => {
  // spec: spec/testcases/note/index.md#AcquireEditLock
  const getContainer = setupTestContainer();

  it("acquires a fresh lock for the caller when no lock exists", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);

    await acquireEditLock({
      container,
      input: { actorUserId: owner, noteId, ttlSec: TTL_SEC },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.editLockUserId).toBe(owner);
    expect(rows[0]?.editLockExpiresAt).not.toBeNull();
  });

  it("re-acquiring an own lock extends it rather than failing", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const initialAcquiredAt = new Date(Date.now() - 60 * 1000);
    const initialExpiresAt = new Date(Date.now() + 60 * 1000);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: owner,
      editLockAcquiredAt: initialAcquiredAt,
      editLockExpiresAt: initialExpiresAt,
    });

    await acquireEditLock({
      container,
      input: { actorUserId: owner, noteId, ttlSec: TTL_SEC },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    const newExpiresAt = new Date(rows[0]?.editLockExpiresAt ?? "");
    expect(newExpiresAt.getTime()).toBeGreaterThan(initialExpiresAt.getTime());
    // Note.acquireEditLock unconditionally rewrites acquiredAt to `now`,
    // even when the caller is just re-acquiring their own live lock.
    // Pin that behaviour so a future change to "preserve the original
    // acquiredAt on self re-acquire" is caught.
    const newAcquiredAt = new Date(rows[0]?.editLockAcquiredAt ?? "");
    expect(newAcquiredAt.getTime()).toBeGreaterThan(
      initialAcquiredAt.getTime(),
    );
  });

  it("throws BusinessRuleError(EditLockedByOther) when another user holds a live lock", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: stranger,
      editLockAcquiredAt: new Date(Date.now() - 1000),
      editLockExpiresAt: new Date(Date.now() + 25 * 60 * 1000),
    });

    try {
      await acquireEditLock({
        container,
        input: { actorUserId: owner, noteId, ttlSec: TTL_SEC },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.EditLockedByOther);
    }
  });

  it("steals an expired lock from another user", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // Expired lock — acquiredAt 20min ago, expiresAt 10min ago.
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: stranger,
      editLockAcquiredAt: new Date(Date.now() - 20 * 60 * 1000),
      editLockExpiresAt: new Date(Date.now() - 10 * 60 * 1000),
    });

    await acquireEditLock({
      container,
      input: { actorUserId: owner, noteId, ttlSec: TTL_SEC },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.editLockUserId).toBe(owner);
  });
});

describe("extendEditLock (integration)", () => {
  // spec: spec/testcases/note/index.md#AcquireEditLock / ExtendEditLock ...
  const getContainer = setupTestContainer();

  it("extends a lock the caller already owns and bumps expiresAt", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const acquired = new Date(Date.now() - 60 * 1000);
    const expires = new Date(Date.now() + 60 * 1000);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: owner,
      editLockAcquiredAt: acquired,
      editLockExpiresAt: expires,
    });

    await extendEditLock({
      container,
      input: { actorUserId: owner, noteId, ttlSec: TTL_SEC },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    const newExpires = new Date(rows[0]?.editLockExpiresAt ?? "");
    expect(newExpires.getTime()).toBeGreaterThan(expires.getTime());
  });

  it("throws BusinessRuleError when extending a lock held by another user", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: stranger,
      editLockAcquiredAt: new Date(Date.now() - 1000),
      editLockExpiresAt: new Date(Date.now() + 25 * 60 * 1000),
    });

    try {
      await extendEditLock({
        container,
        input: { actorUserId: owner, noteId, ttlSec: TTL_SEC },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      // Note.extendEditLock checks ownership before liveness: a live lock
      // held by another user takes the `existing.userId !== userId` branch
      // and throws ExtendNotOwner (EditLockedByOther is only reachable when
      // the caller's own lock has lapsed). Pin to ExtendNotOwner so a
      // future reordering of the checks is caught.
      expect(error.code).toBe(NoteErrorCode.ExtendNotOwner);
    }
  });
});

describe("releaseEditLock (integration)", () => {
  // spec: spec/testcases/note/index.md#... / ReleaseEditLock
  const getContainer = setupTestContainer();

  // ADR-005: spec only enumerates the "other user" rejection branch, but
  // without a happy-path guard a regression that turns releaseEditLock
  // into a permanent noop would slip through. One minimum guard test is
  // added intentionally beyond the spec table.
  it("clears the lock fields on the note row when the holder releases", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: owner,
      editLockAcquiredAt: new Date(Date.now() - 60 * 1000),
      editLockExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await releaseEditLock({
      container,
      input: { actorUserId: owner, noteId },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(rows[0]?.editLockUserId).toBeNull();
    expect(rows[0]?.editLockAcquiredAt).toBeNull();
    expect(rows[0]?.editLockExpiresAt).toBeNull();
  });

  it("throws BusinessRuleError(ReleaseNotOwner) when releasing a lock held by another user", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir, {
      editLockUserId: stranger,
      editLockAcquiredAt: new Date(Date.now() - 1000),
      editLockExpiresAt: new Date(Date.now() + 25 * 60 * 1000),
    });

    try {
      await releaseEditLock({
        container,
        input: { actorUserId: owner, noteId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.ReleaseNotOwner);
    }
  });
});
