import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import { isForbiddenError } from "@/core/application/errors";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import {
  BACKFILL_OWNER_PAGE_SIZE,
  backfillAllOwnersInternalLinkResolution,
} from "../backfillAllOwnersInternalLinkResolution";

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7da-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(
  container: TestContainer,
  opts: { role: "admin" | "member" } = { role: "member" },
): Promise<UserId> {
  const id = nextId(0x0a);
  await container.db.insert(schema.users).values({
    id,
    name: "T",
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
  opts: { title?: string } = {},
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: opts.title ?? "seeded",
    contentHtml: "<p>seed</p>",
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

async function seedLink(
  container: TestContainer,
  fromNoteId: NoteId,
  ref: { kind: "id" | "title"; target: string },
): Promise<string> {
  const id = nextId(0x0d);
  await container.db.insert(schema.noteInternalLinks).values({
    id,
    fromNoteId,
    refKind: ref.kind,
    refTarget: ref.target,
    displayText: null,
    resolvedNoteId: null,
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

describe("backfillAllOwnersInternalLinkResolution (integration)", () => {
  const getContainer = setupTestContainer();

  it("rejects non-admin actors with ForbiddenError", async () => {
    const container = getContainer();
    const member = await seedUser(container, { role: "member" });

    let caught: unknown;
    try {
      await backfillAllOwnersInternalLinkResolution({
        container,
        input: { actorUserId: member as unknown as string },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });

  it("resolves stale rows across multiple owners and aggregates counts", async () => {
    const container = getContainer();
    const admin = await seedUser(container, { role: "admin" });

    const owner1 = await seedUser(container, { role: "member" });
    const dir1 = await seedDirectory(container, owner1);
    const a1 = await seedNote(container, owner1, dir1, { title: "A" });
    const b1 = await seedNote(container, owner1, dir1, { title: "B" });
    const link1 = await seedLink(container, b1, { kind: "title", target: "A" });

    const owner2 = await seedUser(container, { role: "member" });
    const dir2 = await seedDirectory(container, owner2);
    const a2 = await seedNote(container, owner2, dir2, { title: "A" });
    const b2 = await seedNote(container, owner2, dir2, { title: "B" });
    const link2 = await seedLink(container, b2, { kind: "title", target: "A" });

    const owner3 = await seedUser(container, { role: "member" });
    const dir3 = await seedDirectory(container, owner3);
    const a3 = await seedNote(container, owner3, dir3, { title: "A" });
    const b3 = await seedNote(container, owner3, dir3, { title: "B" });
    const link3 = await seedLink(container, b3, { kind: "title", target: "A" });

    const out = await backfillAllOwnersInternalLinkResolution({
      container,
      input: { actorUserId: admin as unknown as string },
    });

    // admin + owner1..3 are all walked (admin owns no notes/links).
    expect(out.ownerCount).toBe(4);
    expect(out.resolvedRows).toBe(3);
    // scannedNotes is the sum of per-owner active-note scans: admin owns 0,
    // each of owner1..3 owns 2 active notes (A + B) → 0 + 2 + 2 + 2 = 6.
    expect(out.scannedNotes).toBe(6);

    expect(await getResolved(container, link1)).toBe(a1);
    expect(await getResolved(container, link2)).toBe(a2);
    expect(await getResolved(container, link3)).toBe(a3);
  });

  it("walks past the owner page-size boundary (cursor handoff + termination)", async () => {
    const container = getContainer();
    const admin = await seedUser(container, { role: "admin" });

    // Seed BACKFILL_OWNER_PAGE_SIZE + 1 member owners so the cursor-based
    // owner walk must advance to a second page. Each owner gets one
    // self-contained unresolved title link (B → [[A]]) that resolves within
    // that owner. admin owns no notes/links, so resolvedRows excludes it.
    const seedOwnerWithUnresolvedLink = async (): Promise<{
      target: NoteId;
      link: string;
    }> => {
      const owner = await seedUser(container, { role: "member" });
      const dir = await seedDirectory(container, owner);
      const a = await seedNote(container, owner, dir, { title: "A" });
      const b = await seedNote(container, owner, dir, { title: "B" });
      const link = await seedLink(container, b, { kind: "title", target: "A" });
      return { target: a, link };
    };

    const ownerCount = BACKFILL_OWNER_PAGE_SIZE + 1;
    const seeded: Array<{ target: NoteId; link: string }> = [];
    for (let i = 0; i < ownerCount; i += 1) {
      seeded.push(await seedOwnerWithUnresolvedLink());
    }

    const out = await backfillAllOwnersInternalLinkResolution({
      container,
      input: { actorUserId: admin as unknown as string },
    });

    // Members each contribute one resolved row; admin contributes none.
    expect(out.resolvedRows).toBe(BACKFILL_OWNER_PAGE_SIZE + 1);
    // ownerCount counts every walked owner, admin included (matches the
    // multi-owner case where admin is one of the four walked owners).
    expect(out.ownerCount).toBe(BACKFILL_OWNER_PAGE_SIZE + 2);

    for (const { target, link } of seeded) {
      expect(await getResolved(container, link)).toBe(target);
    }
  });

  it("is idempotent: a second run resolves nothing", async () => {
    const container = getContainer();
    const admin = await seedUser(container, { role: "admin" });

    const owner = await seedUser(container, { role: "member" });
    const dir = await seedDirectory(container, owner);
    const a = await seedNote(container, owner, dir, { title: "A" });
    const b = await seedNote(container, owner, dir, { title: "B" });
    const link = await seedLink(container, b, { kind: "title", target: "A" });

    const first = await backfillAllOwnersInternalLinkResolution({
      container,
      input: { actorUserId: admin as unknown as string },
    });
    expect(first.resolvedRows).toBe(1);
    expect(await getResolved(container, link)).toBe(a);

    const second = await backfillAllOwnersInternalLinkResolution({
      container,
      input: { actorUserId: admin as unknown as string },
    });
    expect(second.resolvedRows).toBe(0);
    expect(await getResolved(container, link)).toBe(a);
  });
});
