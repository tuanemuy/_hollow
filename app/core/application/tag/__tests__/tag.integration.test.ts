import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import { isBusinessRuleError } from "@/core/domain/error";
import { TagErrorCode } from "@/core/domain/tag/errorCode";
import {
  setupTestContainer,
  type TestContainer,
} from "../../__tests__/helpers";
import type { UserId } from "../../dto/identity";
import type { NoteId } from "../../dto/note";
import type { TagId } from "../../dto/tag";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { createTag } from "../createTag";
import { deleteTag } from "../deleteTag";
import { listTags } from "../listTags";
import { mergeTags } from "../mergeTags";
import { renameTag } from "../renameTag";

const baseTime = new Date("2026-01-01T00:00:00.000Z");
const iso = (ms: number) => new Date(baseTime.getTime() + ms).toISOString();

const OWNER_A = "01950000-0000-7000-8000-00000000000a" as UserId;
const OWNER_B = "01950000-0000-7000-8000-00000000000b" as UserId;

const tagRawId = (n: number) =>
  `019d7000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const noteRawId = (n: number) =>
  `019d0000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const dirRawId = (n: number) =>
  `019dd000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

async function seedUser(
  container: TestContainer,
  id: UserId,
  username: string,
) {
  await container.db.insert(schema.users).values({
    id: id as unknown as string,
    name: username,
    email: `${username}@example.com`,
    emailVerified: 1,
    createdAt: iso(0),
    updatedAt: iso(0),
    username,
    role: "member",
    banned: 0,
  });
}

async function seedDirectory(
  container: TestContainer,
  id: string,
  ownerId: UserId,
) {
  await container.db.insert(schema.directories).values({
    id,
    ownerId: ownerId as unknown as string,
    parentId: null,
    name: "root",
    slug: `root-${id.slice(-6)}`,
    depth: 0,
    version: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
}

async function seedTag(
  container: TestContainer,
  id: string,
  ownerId: UserId,
  name: string,
  noteCount = 0,
) {
  await container.db.insert(schema.tags).values({
    id,
    ownerId: ownerId as unknown as string,
    name,
    nameNormalized: name,
    noteCount,
    version: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
}

async function seedNote(
  container: TestContainer,
  params: {
    id: string;
    ownerId: UserId;
    directoryId: string;
    title: string;
    contentHtml: string;
    tagIds?: readonly string[];
  },
) {
  await container.db.insert(schema.notes).values({
    id: params.id,
    ownerId: params.ownerId as unknown as string,
    directoryId: params.directoryId,
    slug: `note-${params.id.slice(-6)}`,
    title: params.title,
    contentHtml: params.contentHtml,
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    createdAt: iso(0),
    updatedAt: iso(0),
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  for (const tagId of params.tagIds ?? []) {
    await container.db
      .insert(schema.noteTags)
      .values({ noteId: params.id, tagId });
  }
}

describe("createTag integration", () => {
  const getContainer = setupTestContainer();

  it("creates a tag for a new name and commits the row", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");

    const { tag } = await createTag({
      container,
      input: { actorUserId: OWNER_A, name: "fresh" },
    });

    expect(tag.name).toBe("fresh");
    const rows = await container.db.select().from(schema.tags);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(tag.id);
    expect(rows[0]?.ownerId).toBe(OWNER_A);
  });

  it("strips a leading `#` from the input name", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");

    const { tag } = await createTag({
      container,
      input: { actorUserId: OWNER_A, name: "#hashy" },
    });
    expect(tag.name).toBe("hashy");
  });

  it("throws BusinessRuleError(NameNotUnique) when the name (after normalisation) already exists", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedTag(container, tagRawId(1), OWNER_A, "dup");

    try {
      await createTag({
        container,
        input: { actorUserId: OWNER_A, name: "#dup" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameNotUnique);
      }
    }
  });

  it("throws BusinessRuleError(NameTooLong) when the input exceeds 50 chars after strip", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");

    const tooLong = "a".repeat(51);
    try {
      await createTag({
        container,
        input: { actorUserId: OWNER_A, name: tooLong },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameTooLong);
      }
    }
  });

  it("re-creating a previously blacklisted name lifts the blacklist entry", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await container.db.insert(schema.tagBlacklist).values({
      ownerId: OWNER_A as unknown as string,
      nameNormalized: "revived",
      addedAt: iso(0),
    });

    const { tag } = await createTag({
      container,
      input: { actorUserId: OWNER_A, name: "revived" },
    });
    expect(tag.name).toBe("revived");

    const blacklist = await container.db.select().from(schema.tagBlacklist);
    expect(blacklist).toHaveLength(0);
  });
});

describe("renameTag integration", () => {
  const getContainer = setupTestContainer();

  it("renames the tag and rewrites `#oldName` to `#newName` in note bodies", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const tagId = tagRawId(1);
    await seedTag(container, tagId, OWNER_A, "old");
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      title: "note",
      contentHtml: "hello #old world #old",
      tagIds: [tagId],
    });

    const { tag, affectedNoteIds } = await renameTag({
      container,
      input: {
        actorUserId: OWNER_A,
        tagId: tagId as unknown as TagId,
        newName: "renamed",
      },
    });

    expect(tag.name).toBe("renamed");
    expect(affectedNoteIds).toHaveLength(1);
    expect(affectedNoteIds[0]).toBe(noteRawId(1) as unknown as NoteId);

    const tagRow = await container.db.select().from(schema.tags);
    expect(tagRow[0]?.name).toBe("renamed");
    expect(tagRow[0]?.version).toBe(1);

    const noteRow = await container.db.select().from(schema.notes);
    expect(noteRow[0]?.contentHtml).toBe("hello #renamed world #renamed");
  });

  it("throws BusinessRuleError(NameNotUnique) when newName already belongs to another tag", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    const sourceId = tagRawId(1);
    const otherId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, otherId, OWNER_A, "taken");

    try {
      await renameTag({
        container,
        input: {
          actorUserId: OWNER_A,
          tagId: sourceId as unknown as TagId,
          newName: "taken",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameNotUnique);
      }
    }
  });

  it("rewrites bodies across many matching notes and emits an outbox event per modified note", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const tagId = tagRawId(1);
    await seedTag(container, tagId, OWNER_A, "batch");
    const NOTE_COUNT = 5;
    for (let i = 0; i < NOTE_COUNT; i++) {
      await seedNote(container, {
        id: noteRawId(100 + i),
        ownerId: OWNER_A,
        directoryId: dirRawId(1),
        title: `note-${i}`,
        contentHtml: `#batch body-${i}`,
        tagIds: [tagId],
      });
    }

    const beforeOutbox = await container.db.select().from(schema.outboxEvents);
    const { affectedNoteIds } = await renameTag({
      container,
      input: {
        actorUserId: OWNER_A,
        tagId: tagId as unknown as TagId,
        newName: "batchnew",
      },
    });
    expect(affectedNoteIds).toHaveLength(NOTE_COUNT);

    const afterOutbox = await container.db.select().from(schema.outboxEvents);
    expect(afterOutbox.length).toBeGreaterThan(beforeOutbox.length);
  });
});

describe("mergeTags integration", () => {
  const getContainer = setupTestContainer();

  it("merges source into target and removes source", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_A, "tgt");
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      title: "n",
      contentHtml: "body",
      tagIds: [sourceId],
    });

    const { affectedNoteIds } = await mergeTags({
      container,
      input: {
        actorUserId: OWNER_A,
        sourceTagId: sourceId as unknown as TagId,
        targetTagId: targetId as unknown as TagId,
      },
    });

    expect(affectedNoteIds).toHaveLength(1);
    const tagsAfter = await container.db.select().from(schema.tags);
    expect(tagsAfter).toHaveLength(1);
    expect(tagsAfter[0]?.id).toBe(targetId);
    const noteTagsAfter = await container.db.select().from(schema.noteTags);
    expect(noteTagsAfter).toHaveLength(1);
    expect(noteTagsAfter[0]?.tagId).toBe(targetId);
  });

  it("throws BusinessRuleError(MergeSameTag) when source and target are the same tag", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    const sameId = tagRawId(1);
    await seedTag(container, sameId, OWNER_A, "x");

    try {
      await mergeTags({
        container,
        input: {
          actorUserId: OWNER_A,
          sourceTagId: sameId as unknown as TagId,
          targetTagId: sameId as unknown as TagId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.MergeSameTag);
      }
    }
  });

  it("rejects merging when caller is not the owner of both tags (ForbiddenError)", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedUser(container, OWNER_B, "beta");
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_B, "tgt");

    try {
      await mergeTags({
        container,
        input: {
          actorUserId: OWNER_A,
          sourceTagId: sourceId as unknown as TagId,
          targetTagId: targetId as unknown as TagId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("de-duplicates when a note already carries both source and target", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const sourceId = tagRawId(1);
    const targetId = tagRawId(2);
    await seedTag(container, sourceId, OWNER_A, "src");
    await seedTag(container, targetId, OWNER_A, "tgt");
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      title: "n",
      contentHtml: "body",
      tagIds: [sourceId, targetId],
    });

    await mergeTags({
      container,
      input: {
        actorUserId: OWNER_A,
        sourceTagId: sourceId as unknown as TagId,
        targetTagId: targetId as unknown as TagId,
      },
    });

    const links = await container.db.select().from(schema.noteTags);
    expect(links).toHaveLength(1);
    expect(links[0]?.tagId).toBe(targetId);
  });

  it("returns NotFoundError when source tag does not exist", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    const targetId = tagRawId(2);
    await seedTag(container, targetId, OWNER_A, "tgt");

    try {
      await mergeTags({
        container,
        input: {
          actorUserId: OWNER_A,
          sourceTagId: tagRawId(999) as unknown as TagId,
          targetTagId: targetId as unknown as TagId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });
});

describe("deleteTag integration", () => {
  const getContainer = setupTestContainer();

  it("removes the tag from notes, adds a blacklist entry, and deletes the tag", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedDirectory(container, dirRawId(1), OWNER_A);
    const tagId = tagRawId(1);
    await seedTag(container, tagId, OWNER_A, "doomed");
    await seedNote(container, {
      id: noteRawId(1),
      ownerId: OWNER_A,
      directoryId: dirRawId(1),
      title: "n",
      contentHtml: "body #doomed",
      tagIds: [tagId],
    });

    const { affectedNoteIds } = await deleteTag({
      container,
      input: { actorUserId: OWNER_A, tagId: tagId as unknown as TagId },
    });
    expect(affectedNoteIds).toHaveLength(1);

    const tagsAfter = await container.db.select().from(schema.tags);
    expect(tagsAfter).toHaveLength(0);

    const links = await container.db.select().from(schema.noteTags);
    expect(links).toHaveLength(0);

    const blacklist = await container.db.select().from(schema.tagBlacklist);
    expect(blacklist).toHaveLength(1);
    expect(blacklist[0]?.nameNormalized).toBe("doomed");
  });

  it("deletes an unused tag, adds a blacklist entry, and reports no affected notes", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    const tagId = tagRawId(1);
    await seedTag(container, tagId, OWNER_A, "unused");

    const { affectedNoteIds } = await deleteTag({
      container,
      input: { actorUserId: OWNER_A, tagId: tagId as unknown as TagId },
    });
    expect(affectedNoteIds).toHaveLength(0);

    const tagsAfter = await container.db.select().from(schema.tags);
    expect(tagsAfter).toHaveLength(0);
    const blacklist = await container.db.select().from(schema.tagBlacklist);
    expect(blacklist).toHaveLength(1);
  });

  it("rejects deleting a tag owned by another user (ForbiddenError)", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedUser(container, OWNER_B, "beta");
    const tagId = tagRawId(1);
    await seedTag(container, tagId, OWNER_B, "theirs");

    try {
      await deleteTag({
        container,
        input: { actorUserId: OWNER_A, tagId: tagId as unknown as TagId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });
});

describe("listTags integration", () => {
  const getContainer = setupTestContainer();

  it("paginates with cursor — first page returns `limit` items and a nextCursor", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");

    const TOTAL = 100;
    // Sequential names so default sort `name asc` is predictable.
    for (let i = 0; i < TOTAL; i++) {
      const padded = i.toString().padStart(3, "0");
      await seedTag(container, tagRawId(i + 1), OWNER_A, `n-${padded}`);
    }

    const page1 = await listTags({
      container,
      input: { actorUserId: OWNER_A, limit: 50 },
    });
    expect(page1.tags).toHaveLength(50);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listTags({
      container,
      input: {
        actorUserId: OWNER_A,
        limit: 50,
        cursor: page1.nextCursor,
      },
    });
    expect(page2.tags).toHaveLength(50);
    expect(page2.nextCursor).toBeNull();

    const ids1 = new Set(page1.tags.map((t) => t.id));
    const ids2 = new Set(page2.tags.map((t) => t.id));
    for (const id of ids1) {
      expect(ids2.has(id)).toBe(false);
    }
  });

  it("returns an empty list and null nextCursor when the owner has no tags", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");

    const result = await listTags({
      container,
      input: { actorUserId: OWNER_A, limit: 50 },
    });
    expect(result.tags).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("only returns tags owned by the actor", async () => {
    const container = getContainer();
    await seedUser(container, OWNER_A, "alpha");
    await seedUser(container, OWNER_B, "beta");
    await seedTag(container, tagRawId(1), OWNER_A, "mine");
    await seedTag(container, tagRawId(2), OWNER_B, "theirs");

    const result = await listTags({
      container,
      input: { actorUserId: OWNER_A },
    });
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.name).toBe("mine");
  });
});
