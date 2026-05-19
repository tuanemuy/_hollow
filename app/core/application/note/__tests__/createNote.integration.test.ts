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
import { isSystemError, SystemErrorCode } from "../../errors";
import { createNote } from "../createNote";

// spec: spec/testcases/note/index.md#CreateNote

const TZ = new Date("2026-01-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7d0-${block}-7000-8000-0000000000${tail}`;
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

async function seedMediaAsset(
  container: TestContainer,
  ownerId: UserId,
  status: "pending" | "attached" | "orphan" | "deleting" = "pending",
): Promise<string> {
  const id = nextId(0x0e);
  await container.db.insert(schema.mediaAssets).values({
    id,
    ownerId,
    kind: "image",
    mimeType: "image/png",
    byteSize: 1024,
    backend: "r2",
    storageKey: `media/${id}`,
    refCount: status === "attached" ? 1 : 0,
    status,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

describe("createNote (integration)", () => {
  // spec: spec/testcases/note/index.md#CreateNote
  const getContainer = setupTestContainer();

  it("uses '無題' as the title and auto-generates a slug when title and content are empty", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    await seedDirectory(container, owner);

    const { note } = await createNote({
      container,
      input: {
        actorUserId: owner,
        directoryId: null,
        title: "",
        contentHtml: "",
        frontMatter: {},
        tagNames: [],
        internalLinkRefs: [],
      },
    });

    expect(note.title).toBe("無題");
    expect(note.slug.length).toBeGreaterThan(0);
    const rows = await container.db.select().from(schema.notes);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("無題");
  });

  it("strips <script> tags from HTML input via sanitization", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    await seedDirectory(container, owner);

    const { note } = await createNote({
      container,
      input: {
        actorUserId: owner,
        directoryId: null,
        title: "scripty",
        contentHtml: "<p>hi</p><script>alert(1)</script>",
        frontMatter: {},
        tagNames: [],
        internalLinkRefs: [],
      },
    });

    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, note.id as unknown as string));
    const stored = rows[0]?.contentHtml ?? "";
    // The sanitizer strips the disallowed `<script>` tag itself; any
    // text payload that sat between the open / close tokens becomes
    // text content (escaped), but the `<script>` element no longer
    // exists in the DOM.
    expect(stored).not.toContain("<script");
    expect(stored).not.toContain("</script");
  });

  it("auto-extracts #tag tokens from the body, creating tag rows and note_tags links", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    await seedDirectory(container, owner);

    const { note } = await createNote({
      container,
      input: {
        actorUserId: owner,
        directoryId: null,
        title: "tagged",
        contentHtml: "<p>hello #alpha and #beta</p>",
        frontMatter: {},
        tagNames: [],
        internalLinkRefs: [],
      },
    });

    const tags = await container.db.select().from(schema.tags);
    const names = tags.map((t) => t.name).sort();
    expect(names).toEqual(["alpha", "beta"]);

    const links = await container.db
      .select()
      .from(schema.noteTags)
      .where(eq(schema.noteTags.noteId, note.id as unknown as string));
    expect(links).toHaveLength(2);
  });

  it("persists [[Other]] tokens as unresolved internal-link rows", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    await seedDirectory(container, owner);

    const { note } = await createNote({
      container,
      input: {
        actorUserId: owner,
        directoryId: null,
        title: "linker",
        contentHtml: "<p>see [[Other]] please</p>",
        frontMatter: {},
        tagNames: [],
        internalLinkRefs: [],
      },
    });

    const links = await container.db
      .select()
      .from(schema.noteInternalLinks)
      .where(
        eq(schema.noteInternalLinks.fromNoteId, note.id as unknown as string),
      );
    expect(links).toHaveLength(1);
    expect(links[0]?.refKind).toBe("title");
    expect(links[0]?.refTarget).toBe("Other");
    expect(links[0]?.resolvedNoteId).toBeNull();
  });

  it("throws BusinessRuleError(MediaNotOwned) when the body embeds another user's media", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const stranger = await seedUser(container);
    await seedDirectory(container, owner);
    const mediaId = await seedMediaAsset(container, stranger, "attached");

    try {
      await createNote({
        container,
        input: {
          actorUserId: owner,
          directoryId: null,
          title: "thief",
          contentHtml: `<p><img src="/media/${mediaId}" alt="x" /></p>`,
          frontMatter: {},
          tagNames: [],
          internalLinkRefs: [],
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(NoteErrorCode.MediaNotOwned);
    }
  });

  // ADR-004 #9: spec calls for BusinessRuleError(content_too_large), but
  // the sanitizer pipeline (htmlSanitizer.ts:307) wraps the inner
  // ContentHtml.create failure as a SystemError(DataIntegrityError) before
  // the usecase ever sees the BusinessRuleError. We pin the implementation
  // reality — SystemError on the outside, BusinessRuleError(ContentTooLarge)
  // as the cause — so a future change in either direction is caught.
  it("translates oversized content (>1 MiB) into a system-level failure via the sanitizer", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    await seedDirectory(container, owner);

    // 1 MiB + 1 byte of ASCII payload.
    const tooLong = "a".repeat(1024 * 1024 + 1);
    try {
      await createNote({
        container,
        input: {
          actorUserId: owner,
          directoryId: null,
          title: "big",
          contentHtml: tooLong,
          frontMatter: {},
          tagNames: [],
          internalLinkRefs: [],
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isSystemError(error)) {
        throw error;
      }
      expect(error.code).toBe(SystemErrorCode.DataIntegrityError);
      const cause = (error as { cause?: unknown }).cause;
      if (!isBusinessRuleError(cause)) {
        throw error;
      }
      expect(cause.code).toBe(NoteErrorCode.ContentTooLarge);
    }
  });

  it("appends a numeric suffix when the derived slug collides with an existing note", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    await seedDirectory(container, owner);

    const first = await createNote({
      container,
      input: {
        actorUserId: owner,
        directoryId: null,
        title: "Same Title",
        contentHtml: "<p>one</p>",
        frontMatter: {},
        tagNames: [],
        internalLinkRefs: [],
      },
    });
    const second = await createNote({
      container,
      input: {
        actorUserId: owner,
        directoryId: null,
        title: "Same Title",
        contentHtml: "<p>two</p>",
        frontMatter: {},
        tagNames: [],
        internalLinkRefs: [],
      },
    });

    expect(first.note.slug).not.toBe(second.note.slug);
    expect(second.note.slug.startsWith(first.note.slug)).toBe(true);
    expect(second.note.slug).toMatch(/-\d+$/);
  });
});
