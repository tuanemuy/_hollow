import { describe, expect, it } from "vitest";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import { TagId } from "@/core/domain/tag/valueObject";
import { Note } from "../entity";
import { NoteErrorCode } from "../errorCode";
import {
  ContentHtml,
  EditLock,
  FrontMatter,
  type InternalLinkRef as InternalLinkRefType,
  NoteSlug,
  NoteTitle,
} from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;

const OWNER: UserId = "user-owner" as UserId;
const OTHER: UserId = "user-other" as UserId;
const DIR_A: DirectoryId = "dir-a" as DirectoryId;
const DIR_B: DirectoryId = "dir-b" as DirectoryId;

const baseInput = (
  overrides: Partial<Parameters<typeof Note.create>[0]> = {},
) => ({
  id: rawId(1),
  ownerId: OWNER,
  directoryId: DIR_A,
  slug: NoteSlug.create("hello"),
  title: NoteTitle.create("Hello"),
  contentHtml: ContentHtml.create("<p>hi</p>"),
  frontMatter: FrontMatter.empty(),
  tagIds: [] as readonly TagId[],
  internalLinkRefs: [] as readonly InternalLinkRefType[],
  mediaRefs: [] as readonly MediaAssetId[],
  ...overrides,
});

describe("Note.create", () => {
  it("yields an active note with version 0, no lock, no trashedAt", () => {
    const { entity, eventDrafts } = Note.create(baseInput(), T0);
    expect(entity.status).toBe("active");
    expect(entity.trashedAt).toBeNull();
    expect(entity.editLock).toBeNull();
    expect(entity.version).toBe(0);
    expect(entity.createdAt.getTime()).toBe(T0.getTime());
    expect(entity.updatedAt.getTime()).toBe(T0.getTime());
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("note.created");
  });

  it("dedupes tagIds / mediaRefs / internalLinkRefs at creation", () => {
    const tag = TagId.create(rawId(10));
    const media = MediaAssetId.create(rawId(20));
    const ref: InternalLinkRefType = {
      kind: "title",
      target: "x",
      resolvedNoteId: null,
      displayText: null,
    };
    const { entity } = Note.create(
      baseInput({
        tagIds: [tag, tag],
        mediaRefs: [media, media],
        internalLinkRefs: [ref, ref],
      }),
      T0,
    );
    expect(entity.tagIds).toHaveLength(1);
    expect(entity.mediaRefs).toHaveLength(1);
    expect(entity.internalLinkRefs).toHaveLength(1);
  });
});

describe("Note.updateContent", () => {
  const userLock = (now: Date, userId: UserId): EditLock =>
    EditLock.create({
      userId,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    });

  it("applies content + bumps version + emits content_updated", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: next, eventDrafts } = Note.updateContent(entity, {
      title: NoteTitle.create("New"),
      contentHtml: ContentHtml.create("<p>changed</p>"),
      now: at(1),
      actorUserId: OWNER,
      requireLock: false,
    });
    expect(next.title as unknown as string).toBe("New");
    expect(next.contentHtml as unknown as string).toBe("<p>changed</p>");
    expect(next.version).toBe(entity.version + 1);
    expect(next.updatedAt.getTime()).toBe(at(1).getTime());
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("note.content_updated");
  });

  it("requireLock=true, no lock present -> EditLockedByOther", () => {
    const { entity } = Note.create(baseInput(), T0);
    try {
      Note.updateContent(entity, {
        now: at(1),
        actorUserId: OWNER,
        requireLock: true,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.EditLockedByOther);
      }
    }
  });

  it("requireLock=true, actor holds the lock -> passes", () => {
    const { entity } = Note.create(baseInput(), T0);
    const locked = Note.acquireEditLock(entity, OWNER, at(1), 60);
    const { entity: next } = Note.updateContent(locked, {
      title: NoteTitle.create("Locked Edit"),
      now: at(2),
      actorUserId: OWNER,
      requireLock: true,
    });
    expect(next.version).toBe(locked.version + 1);
  });

  it("requireLock=false, other user holds a live lock -> EditLockedByOther", () => {
    const { entity } = Note.create(baseInput(), T0);
    const otherLocked = {
      ...entity,
      editLock: userLock(at(1), OTHER),
    } as typeof entity;
    try {
      Note.updateContent(otherLocked, {
        now: at(2),
        actorUserId: OWNER,
        requireLock: false,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.EditLockedByOther);
      }
    }
  });

  it("requireLock=false, other user's lock expired -> passes", () => {
    const { entity } = Note.create(baseInput(), T0);
    const expired: EditLock = {
      userId: OTHER,
      acquiredAt: at(1),
      expiresAt: at(2),
    };
    const note = { ...entity, editLock: expired } as typeof entity;
    const { entity: next } = Note.updateContent(note, {
      contentHtml: ContentHtml.create("<p>after expiry</p>"),
      now: at(10),
      actorUserId: OWNER,
      requireLock: false,
    });
    expect(next.version).toBe(note.version + 1);
  });

  it("is a no-op when every field matches the current content", () => {
    const tag = TagId.create(rawId(10));
    const media = MediaAssetId.create(rawId(20));
    const ref: InternalLinkRefType = {
      kind: "title",
      target: "x",
      resolvedNoteId: null,
      displayText: null,
    };
    const { entity } = Note.create(
      baseInput({ tagIds: [tag], mediaRefs: [media], internalLinkRefs: [ref] }),
      T0,
    );
    // Resubmit identical content (the same values the note already holds).
    const { entity: same, eventDrafts } = Note.updateContent(entity, {
      title: entity.title,
      contentHtml: entity.contentHtml,
      frontMatter: entity.frontMatter,
      tagIds: [tag],
      mediaRefs: [media],
      internalLinkRefs: [ref],
      now: at(5),
      actorUserId: OWNER,
      requireLock: false,
    });
    expect(same).toBe(entity);
    expect(same.version).toBe(entity.version);
    expect(eventDrafts).toHaveLength(0);
  });

  it("is a no-op when called with no field arguments", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: same, eventDrafts } = Note.updateContent(entity, {
      now: at(5),
      actorUserId: OWNER,
      requireLock: false,
    });
    expect(same).toBe(entity);
    expect(eventDrafts).toHaveLength(0);
  });

  it("treats a link ref differing only in resolvedNoteId as a no-op", () => {
    const resolved: InternalLinkRefType = {
      kind: "title",
      target: "x",
      resolvedNoteId: "some-note-id" as never,
      displayText: null,
    };
    const { entity } = Note.create(
      baseInput({ internalLinkRefs: [resolved] }),
      T0,
    );
    // Same kind+target, but resolvedNoteId is null this time. The resolver
    // sets resolvedNoteId out-of-band, so `InternalLinkRef.equals` (and
    // hence the no-op check) must ignore it - resubmitting the parsed-but-
    // unresolved ref must not count as a content change.
    const unresolved: InternalLinkRefType = {
      kind: "title",
      target: "x",
      resolvedNoteId: null,
      displayText: null,
    };
    const { entity: same, eventDrafts } = Note.updateContent(entity, {
      internalLinkRefs: [unresolved],
      now: at(5),
      actorUserId: OWNER,
      requireLock: false,
    });
    expect(same).toBe(entity);
    expect(eventDrafts).toHaveLength(0);
  });

  it("is order-sensitive: reordering tagIds is a content change", () => {
    const tagA = TagId.create(rawId(10));
    const tagB = TagId.create(rawId(11));
    const { entity } = Note.create(baseInput({ tagIds: [tagA, tagB] }), T0);
    // Same set, different order. The comparison is intentionally ordered
    // (conservative), so this is NOT a no-op - version bumps and the
    // content_updated event fires.
    const { entity: next, eventDrafts } = Note.updateContent(entity, {
      tagIds: [tagB, tagA],
      now: at(5),
      actorUserId: OWNER,
      requireLock: false,
    });
    expect(next).not.toBe(entity);
    expect(next.version).toBe(entity.version + 1);
    expect(eventDrafts).toHaveLength(1);
  });

  it("bumps version + emits content_updated when only one field changes", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: next, eventDrafts } = Note.updateContent(entity, {
      contentHtml: ContentHtml.create("<p>edited</p>"),
      now: at(5),
      actorUserId: OWNER,
      requireLock: false,
    });
    expect(next.version).toBe(entity.version + 1);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("note.content_updated");
  });
});

describe("Note.moveTo", () => {
  it("changes directoryId, bumps version, emits note.moved", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: moved, eventDrafts } = Note.moveTo(entity, DIR_B, at(1));
    expect(moved.directoryId).toBe(DIR_B);
    expect(moved.version).toBe(entity.version + 1);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("note.moved");
  });

  it("no-op when target directory is the current one", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: moved, eventDrafts } = Note.moveTo(entity, DIR_A, at(1));
    expect(moved).toBe(entity);
    expect(eventDrafts).toHaveLength(0);
  });

  it("throws CannotMoveTrashed for trashed notes", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: trashed } = Note.trash(entity, at(1));
    try {
      Note.moveTo(trashed, DIR_B, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.CannotMoveTrashed);
      }
    }
  });
});

describe("Note.rename", () => {
  it("changes title/slug, bumps version, emits renamed event", () => {
    const { entity } = Note.create(baseInput(), T0);
    const newTitle = NoteTitle.create("New");
    const newSlug = NoteSlug.create("new");
    const { entity: next, eventDrafts } = Note.rename(
      entity,
      newTitle,
      newSlug,
      at(1),
    );
    expect(next.title).toBe(newTitle);
    expect(next.slug).toBe(newSlug);
    expect(next.version).toBe(entity.version + 1);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("note.renamed");
  });

  it("no-op when both title and slug are unchanged", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: next, eventDrafts } = Note.rename(
      entity,
      entity.title,
      entity.slug,
      at(1),
    );
    expect(next).toBe(entity);
    expect(eventDrafts).toHaveLength(0);
  });
});

describe("Note.trash / Note.restore", () => {
  it("trash flips status, clears lock, emits trashed event", () => {
    const { entity: active } = Note.create(baseInput(), T0);
    const locked = Note.acquireEditLock(active, OWNER, at(1), 60);
    const { entity: trashed, eventDrafts } = Note.trash(locked, at(2));
    expect(trashed.status).toBe("trashed");
    expect(trashed.trashedAt?.getTime()).toBe(at(2).getTime());
    expect(trashed.editLock).toBeNull();
    expect(trashed.version).toBe(locked.version + 1);
    expect(eventDrafts[0]?.type).toBe("note.trashed");
  });

  it("trash on an already-trashed note throws AlreadyTrashed", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: once } = Note.trash(entity, at(1));
    try {
      Note.trash(once, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.AlreadyTrashed);
      }
    }
  });

  it("restore flips status back to active and emits restored event", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: trashed } = Note.trash(entity, at(1));
    const { entity: restored, eventDrafts } = Note.restore(
      trashed,
      null,
      at(2),
    );
    expect(restored.status).toBe("active");
    expect(restored.trashedAt).toBeNull();
    expect(restored.directoryId).toBe(entity.directoryId);
    expect(restored.version).toBe(trashed.version + 1);
    expect(eventDrafts[0]?.type).toBe("note.restored");
  });

  it("restore can redirect to a new directory", () => {
    const { entity } = Note.create(baseInput(), T0);
    const { entity: trashed } = Note.trash(entity, at(1));
    const { entity: restored } = Note.restore(trashed, DIR_B, at(2));
    expect(restored.directoryId).toBe(DIR_B);
  });

  it("restore on an active note throws NotTrashed", () => {
    const { entity } = Note.create(baseInput(), T0);
    try {
      Note.restore(entity, null, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.NotTrashed);
      }
    }
  });
});

describe("Note.acquireEditLock / extendEditLock / releaseEditLock", () => {
  it("acquireEditLock attaches a lock for the actor", () => {
    const { entity } = Note.create(baseInput(), T0);
    const next = Note.acquireEditLock(entity, OWNER, at(1), 60);
    expect(next.editLock?.userId).toBe(OWNER);
    expect(next.editLock?.expiresAt.getTime()).toBe(at(1).getTime() + 60_000);
    expect(next.version).toBe(entity.version + 1);
  });

  it("acquireEditLock by the same user refreshes (no error)", () => {
    const { entity } = Note.create(baseInput(), T0);
    const once = Note.acquireEditLock(entity, OWNER, at(1), 60);
    const twice = Note.acquireEditLock(once, OWNER, at(2), 60);
    expect(twice.editLock?.userId).toBe(OWNER);
    expect(twice.editLock?.acquiredAt.getTime()).toBe(at(2).getTime());
    expect(twice.version).toBe(once.version + 1);
  });

  it("acquireEditLock with a live foreign lock throws EditLockedByOther", () => {
    const { entity } = Note.create(baseInput(), T0);
    const otherHeld = Note.acquireEditLock(entity, OTHER, at(1), 60);
    try {
      Note.acquireEditLock(otherHeld, OWNER, at(2), 60);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.EditLockedByOther);
      }
    }
  });

  it("acquireEditLock when foreign lock has expired succeeds (steal)", () => {
    const { entity } = Note.create(baseInput(), T0);
    const otherHeld = Note.acquireEditLock(entity, OTHER, at(1), 1);
    const stolen = Note.acquireEditLock(otherHeld, OWNER, at(60_000), 60);
    expect(stolen.editLock?.userId).toBe(OWNER);
  });

  it("extendEditLock by the owner moves expiresAt forward", () => {
    const { entity } = Note.create(baseInput(), T0);
    const held = Note.acquireEditLock(entity, OWNER, at(1), 60);
    const extended = Note.extendEditLock(held, OWNER, at(30_000), 60);
    expect(extended.editLock?.expiresAt.getTime()).toBe(
      at(30_000).getTime() + 60_000,
    );
    expect(extended.editLock?.acquiredAt.getTime()).toBe(
      held.editLock?.acquiredAt.getTime(),
    );
  });

  it("extendEditLock by a non-owner throws ExtendNotOwner", () => {
    const { entity } = Note.create(baseInput(), T0);
    const held = Note.acquireEditLock(entity, OWNER, at(1), 60);
    try {
      Note.extendEditLock(held, OTHER, at(2), 60);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.ExtendNotOwner);
      }
    }
  });

  it("extendEditLock when there is no live lock throws EditLockedByOther", () => {
    const { entity } = Note.create(baseInput(), T0);
    const expired: EditLock = {
      userId: OWNER,
      acquiredAt: at(1),
      expiresAt: at(2),
    };
    const note = { ...entity, editLock: expired } as typeof entity;
    try {
      Note.extendEditLock(note, OWNER, at(60_000), 60);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.EditLockedByOther);
      }
    }
  });

  it("releaseEditLock by owner clears the lock without bumping version", () => {
    const { entity } = Note.create(baseInput(), T0);
    const held = Note.acquireEditLock(entity, OWNER, at(1), 60);
    const released = Note.releaseEditLock(held, OWNER);
    expect(released.editLock).toBeNull();
    expect(released.version).toBe(held.version);
  });

  it("releaseEditLock when no lock is held is a no-op (returns same)", () => {
    const { entity } = Note.create(baseInput(), T0);
    const same = Note.releaseEditLock(entity, OWNER);
    expect(same).toBe(entity);
  });

  it("releaseEditLock by a non-owner throws ReleaseNotOwner", () => {
    const { entity } = Note.create(baseInput(), T0);
    const held = Note.acquireEditLock(entity, OWNER, at(1), 60);
    try {
      Note.releaseEditLock(held, OTHER);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(NoteErrorCode.ReleaseNotOwner);
      }
    }
  });
});

describe("Note.replaceTags", () => {
  it("replaces tag set, dedupes, emits tags_replaced", () => {
    const tag1 = TagId.create(rawId(11));
    const tag2 = TagId.create(rawId(12));
    const { entity } = Note.create(
      baseInput({ tagIds: [tag1] as readonly TagId[] }),
      T0,
    );
    const { entity: next, eventDrafts } = Note.replaceTags(
      entity,
      [tag2, tag2],
      at(1),
    );
    expect(next.tagIds).toEqual([tag2]);
    expect(next.version).toBe(entity.version + 1);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("note.tags_replaced");
  });

  it("no-op when tag set is identical (order + values)", () => {
    const tag1 = TagId.create(rawId(11));
    const { entity } = Note.create(
      baseInput({ tagIds: [tag1] as readonly TagId[] }),
      T0,
    );
    const { entity: same, eventDrafts } = Note.replaceTags(
      entity,
      [tag1],
      at(1),
    );
    expect(same).toBe(entity);
    expect(eventDrafts).toHaveLength(0);
  });
});

describe("Note.isActive / isTrashed", () => {
  it("narrows correctly", () => {
    const { entity } = Note.create(baseInput(), T0);
    expect(Note.isActive(entity)).toBe(true);
    expect(Note.isTrashed(entity)).toBe(false);
    const { entity: trashed } = Note.trash(entity, at(1));
    expect(Note.isActive(trashed)).toBe(false);
    expect(Note.isTrashed(trashed)).toBe(true);
  });
});

describe("Note.reconstruct", () => {
  const validRow = () => ({
    id: rawId(100),
    ownerId: "user-1",
    directoryId: "dir-1",
    slug: "hello",
    title: "rehydrated",
    contentHtml: "<p>x</p>",
    frontMatter: { k: "v" } as Record<string, unknown> as Parameters<
      typeof Note.reconstruct
    >[0]["frontMatter"],
    tagIds: [] as string[],
    internalLinkRefs: [] as ReadonlyArray<{
      kind: string;
      target: string;
      resolvedNoteId: string | null;
      displayText: string | null;
    }>,
    mediaRefs: [] as string[],
    status: "active",
    trashedAt: null,
    editLock: null,
    version: 3,
    createdAt: T0,
    updatedAt: at(1),
  });

  it("rebuilds an active note", () => {
    const note = Note.reconstruct(validRow());
    expect(note.status).toBe("active");
    expect(note.version).toBe(3);
    expect(note.title as unknown as string).toBe("rehydrated");
  });

  it("rebuilds a trashed note when status='trashed' and trashedAt is set", () => {
    const note = Note.reconstruct({
      ...validRow(),
      status: "trashed",
      trashedAt: at(99),
    });
    expect(note.status).toBe("trashed");
    if (note.status === "trashed") {
      expect(note.trashedAt.getTime()).toBe(at(99).getTime());
    }
  });

  it("throws RehydrationError when stored title is empty", () => {
    try {
      Note.reconstruct({ ...validRow(), title: "   " });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
    }
  });

  it("throws RehydrationError when stored status is unknown", () => {
    try {
      Note.reconstruct({ ...validRow(), status: "archived" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when active has trashedAt set", () => {
    try {
      Note.reconstruct({ ...validRow(), status: "active", trashedAt: at(1) });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when trashed has trashedAt null", () => {
    try {
      Note.reconstruct({
        ...validRow(),
        status: "trashed",
        trashedAt: null,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});
