import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { getPublicNote } from "../getPublicNote";

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7e1-${block}-7000-8000-0000000000${tail}`;
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
  contentHtml: string,
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml,
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    sourceFileId: null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id as NoteId;
}

async function seedInternalLink(
  container: TestContainer,
  fromNoteId: NoteId,
  target: NoteId,
): Promise<void> {
  await container.db.insert(schema.noteInternalLinks).values({
    id: nextId(0x0d),
    fromNoteId,
    refKind: "id",
    refTarget: target as unknown as string,
    displayText: null,
    resolvedNoteId: target as unknown as string,
  });
}

async function seedPublic(
  container: TestContainer,
  noteId: NoteId,
  ownerId: UserId,
): Promise<void> {
  await container.db.insert(schema.publicationStates).values({
    noteId,
    ownerId,
    visibility: "public",
    publishedAt: TZ,
    updatedAt: TZ,
    version: 0,
  });
}

describe("getPublicNote (integration)", () => {
  const getContainer = setupTestContainer();

  it("renders the public body with hashtags non-linking and wikilinks to the public route", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    // A resolved wikilink target: a second public note the body links to.
    const target = await seedNote(container, owner, dir, "<p>target</p>");
    await seedPublic(container, target, owner);

    const noteId = await seedNote(
      container,
      owner,
      dir,
      `<p>see [[${target}]] about #design</p>`,
    );
    await seedPublic(container, noteId, owner);
    await seedInternalLink(container, noteId, target);

    const result = await getPublicNote({
      container,
      input: { kind: "byId", noteId },
    });

    // The DTO keeps the verbatim tokens; the rendered field is marked up.
    expect(result.note.contentHtml).toContain(`[[${target}]]`);
    expect(result.note.contentHtml).toContain("#design");

    // Public hashtag stays a non-linking span (no public tag-filter route).
    expect(result.renderedContentHtml).toContain(
      '<span class="hashtag">#design</span>',
    );
    expect(result.renderedContentHtml).not.toContain('<a class="hashtag"');

    // Public wikilink resolves to the public route, never the auth route.
    expect(result.renderedContentHtml).toContain(
      `<a class="wikilink" href="/notes/public/${target}">`,
    );
    expect(result.renderedContentHtml).not.toContain(`href="/notes/${target}"`);
  });
});
