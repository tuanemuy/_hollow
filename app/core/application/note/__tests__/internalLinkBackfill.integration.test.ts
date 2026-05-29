import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { ConsumerContainer } from "@/core/application/di/types";
import { dispatchDomainEvent } from "@/core/application/workers/dispatchDomainEvent";
import type { DomainEvent } from "@/core/domain/common/event";
import { EventId } from "@/core/domain/common/event";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { backfillInternalLinkResolution } from "../backfillInternalLinkResolution";

// Issue #321: post-hoc re-resolution of note_internal_links.resolved_note_id.

const TZ = new Date("2026-02-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d9-${block}-7000-8000-0000000000${tail}`;
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
  opts: { title?: string; status?: "active" | "trashed" } = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  const status = opts.status ?? "active";
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: opts.title ?? "seeded",
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

async function seedLink(
  container: TestContainer,
  fromNoteId: NoteId,
  ref: {
    kind: "id" | "title";
    target: string;
    resolvedNoteId?: NoteId | null;
  },
): Promise<string> {
  const id = nextId(0x0d);
  await container.db.insert(schema.noteInternalLinks).values({
    id,
    fromNoteId,
    refKind: ref.kind,
    refTarget: ref.target,
    displayText: null,
    resolvedNoteId: ref.resolvedNoteId ?? null,
  });
  return id;
}

async function getResolved(
  container: TestContainer,
  linkRowId: string,
): Promise<string | null> {
  const rows = await container.db
    .select()
    .from(schema.noteInternalLinks)
    .where(eq(schema.noteInternalLinks.id, linkRowId));
  return rows[0]?.resolvedNoteId ?? null;
}

const dispatch = (
  container: TestContainer,
  type: string,
  noteId: NoteId,
  ownerId: UserId,
): Promise<unknown> => {
  const event = {
    id: EventId.create(nextId(0xee)),
    type,
    payload: { noteId, ownerId, mediaRefs: [] },
    occurredAt: new Date(),
    aggregateId: noteId,
  } as unknown as DomainEvent;
  return dispatchDomainEvent(container as ConsumerContainer, event);
};

describe("internal link backfill / re-resolution (integration)", () => {
  const getContainer = setupTestContainer();

  it("created: resolves a link that targeted an absent title", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // B links to [[A]] while A does not exist yet → unresolved.
    const b = await seedNote(container, owner, dir, { title: "B" });
    const link = await seedLink(container, b, {
      kind: "title",
      target: "A",
    });
    expect(await getResolved(container, link)).toBeNull();

    // A is created later.
    const a = await seedNote(container, owner, dir, { title: "A" });
    await dispatch(container, "note.created", a, owner);

    expect(await getResolved(container, link)).toBe(a);
  });

  it("rename via content_updated: unresolves the stale title row and resolves the new title", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedNote(container, owner, dir, { title: "Old" });
    // Link already resolved to A under the old title.
    const oldLink = await seedLink(
      container,
      await seedNote(container, owner, dir, { title: "Ref1" }),
      {
        kind: "title",
        target: "Old",
        resolvedNoteId: a,
      },
    );
    // A pending link to the new title.
    const newLink = await seedLink(
      container,
      await seedNote(container, owner, dir, { title: "Ref2" }),
      {
        kind: "title",
        target: "New",
      },
    );

    // Rename A: Old → New (simulate by updating the row, then dispatch).
    await container.db
      .update(schema.notes)
      .set({ title: "New" })
      .where(eq(schema.notes.id, a as unknown as string));
    await dispatch(container, "note.content_updated", a, owner);

    expect(await getResolved(container, oldLink)).toBeNull();
    expect(await getResolved(container, newLink)).toBe(a);
  });

  it("trash unresolves; restore re-resolves", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedNote(container, owner, dir, { title: "A" });
    const b = await seedNote(container, owner, dir, { title: "B" });
    const titleLink = await seedLink(container, b, {
      kind: "title",
      target: "A",
      resolvedNoteId: a,
    });
    const idLink = await seedLink(container, b, {
      kind: "id",
      target: a,
      resolvedNoteId: a,
    });

    // Trash A.
    await container.db
      .update(schema.notes)
      .set({ status: "trashed", trashedAt: TZ })
      .where(eq(schema.notes.id, a as unknown as string));
    await dispatch(container, "note.trashed", a, owner);

    expect(await getResolved(container, titleLink)).toBeNull();
    expect(await getResolved(container, idLink)).toBeNull();

    // Restore A.
    await container.db
      .update(schema.notes)
      .set({ status: "active", trashedAt: null })
      .where(eq(schema.notes.id, a as unknown as string));
    await dispatch(container, "note.restored", a, owner);

    expect(await getResolved(container, titleLink)).toBe(a);
    expect(await getResolved(container, idLink)).toBe(a);
  });

  it("purge: FK set null clears resolved rows without a handler", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedNote(container, owner, dir, { title: "A" });
    const b = await seedNote(container, owner, dir, { title: "B" });
    const link = await seedLink(container, b, {
      kind: "title",
      target: "A",
      resolvedNoteId: a,
    });

    // Physical delete fires the resolved_note_id FK set null.
    await container.db
      .delete(schema.notes)
      .where(eq(schema.notes.id, a as unknown as string));

    expect(await getResolved(container, link)).toBeNull();
  });

  it("duplicate titles: resolves to the decision-rule winner, re-selects on rename", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // Two notes share the title "Dup"; the lower id wins.
    const a1 = await seedNote(container, owner, dir, { title: "Dup" });
    const a2 = await seedNote(container, owner, dir, { title: "Dup" });
    const [lower, higher] = a1 < a2 ? [a1, a2] : [a2, a1];
    const b = await seedNote(container, owner, dir, { title: "B" });
    const link = await seedLink(container, b, { kind: "title", target: "Dup" });

    // Dispatch for the winner (lower id): the decision rule picks it, so
    // the link resolves to it. (A dispatch for the higher-id note would
    // be a no-op here because the rule does not pick higher.)
    await dispatch(container, "note.created", lower, owner);
    expect(await getResolved(container, link)).toBe(lower);

    // Rename the lower-id note away from "Dup": its content_updated
    // dispatch unresolves the now-stale row (lower no longer matches the
    // link target "Dup").
    await container.db
      .update(schema.notes)
      .set({ title: "Renamed" })
      .where(eq(schema.notes.id, lower as unknown as string));
    await dispatch(container, "note.content_updated", lower, owner);
    expect(await getResolved(container, link)).toBeNull();

    // Dispatch for the remaining "Dup" note (now the sole winner)
    // re-selects the link to it.
    await dispatch(container, "note.content_updated", higher, owner);
    expect(await getResolved(container, link)).toBe(higher);
  });

  it("idempotent: dispatching the same created event twice is stable", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const b = await seedNote(container, owner, dir, { title: "B" });
    const link = await seedLink(container, b, { kind: "title", target: "A" });
    const a = await seedNote(container, owner, dir, { title: "A" });

    await dispatch(container, "note.created", a, owner);
    const first = await getResolved(container, link);
    await dispatch(container, "note.created", a, owner);
    const second = await getResolved(container, link);

    expect(first).toBe(a);
    expect(second).toBe(a);
  });

  it("backfill usecase resolves stale null rows and is idempotent", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const a = await seedNote(container, owner, dir, { title: "A" });
    const b = await seedNote(container, owner, dir, { title: "B" });
    // Two notes both linking to [[A]] left unresolved (pre-#321 state).
    const link1 = await seedLink(container, b, { kind: "title", target: "A" });
    const link2 = await seedLink(container, a, { kind: "title", target: "B" });

    const out = await backfillInternalLinkResolution({
      container,
      input: { ownerId: owner },
    });

    expect(out.resolvedRows).toBeGreaterThanOrEqual(2);
    expect(await getResolved(container, link1)).toBe(a);
    expect(await getResolved(container, link2)).toBe(b);

    // Re-run: nothing left unresolved → no further writes.
    const again = await backfillInternalLinkResolution({
      container,
      input: { ownerId: owner },
    });
    expect(again.resolvedRows).toBe(0);
    expect(await getResolved(container, link1)).toBe(a);
    expect(await getResolved(container, link2)).toBe(b);
  });
});
