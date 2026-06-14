import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1ShareLinkRepository.countActiveByOwner` (#573).
 * Confirms it: counts active (`revoked_at IS NULL`) links across all of an
 * owner's notes, includes links on trashed notes, excludes revoked links,
 * and respects owner boundaries — matching the account-delete cascade's
 * revocation set (ADR-001).
 */

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7fb-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "ShareLink Test",
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: TZ,
    updatedAt: TZ,
    username: `s-${id.slice(9, 13)}`,
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

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: string,
  status: "active" | "trashed",
): Promise<NoteId> {
  const id = nextId(0x03);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `note-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml: "<p>body</p>",
    frontMatterJson: "{}",
    status,
    trashedAt: status === "trashed" ? TZ : null,
    createdAt: TZ,
    updatedAt: TZ,
    version: 0,
  });
  return id as NoteId;
}

async function seedShareLink(
  container: TestContainer,
  ownerId: UserId,
  noteId: NoteId,
  revoked: boolean,
): Promise<void> {
  const id = nextId(0x04);
  await container.db.insert(schema.shareLinks).values({
    id,
    noteId,
    ownerId,
    tokenHash: `hash-${id}`,
    passwordHash: null,
    status: revoked ? "revoked" : "active",
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: TZ,
    revokedAt: revoked ? TZ : null,
    lastAccessedAt: null,
    updatedAt: TZ,
    version: 0,
  });
}

describe("D1ShareLinkRepository.countActiveByOwner (integration, #573)", () => {
  it("counts active links across all owned notes — including trashed notes — and excludes revoked links and other owners", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const other = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const otherDir = await seedDirectory(container, other);

    const activeNote = await seedNote(container, owner, dir, "active");
    const trashedNote = await seedNote(container, owner, dir, "trashed");
    const otherNote = await seedNote(container, other, otherDir, "active");

    // Owner: 2 active on active note, 1 active on a TRASHED note, 1 revoked.
    await seedShareLink(container, owner, activeNote, false);
    await seedShareLink(container, owner, activeNote, false);
    await seedShareLink(container, owner, trashedNote, false);
    await seedShareLink(container, owner, activeNote, true);
    // Other owner's active link must not be counted.
    await seedShareLink(container, other, otherNote, false);

    const count = await container.unitOfWorkProvider.run(
      async ({ shareLinkRepository }) =>
        shareLinkRepository.countActiveByOwner(owner),
    );
    expect(count).toBe(3);
  });

  it("returns 0 when the owner has no active links", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const note = await seedNote(container, owner, dir, "active");
    await seedShareLink(container, owner, note, true); // only a revoked link

    const count = await container.unitOfWorkProvider.run(
      async ({ shareLinkRepository }) =>
        shareLinkRepository.countActiveByOwner(owner),
    );
    expect(count).toBe(0);
  });
});
