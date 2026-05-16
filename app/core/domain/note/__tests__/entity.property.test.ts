import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { Note } from "../entity";
import {
  ContentHtml,
  FrontMatter,
  type InternalLinkRef as InternalLinkRefType,
  NoteSlug,
  NoteTitle,
} from "../valueObject";

const NOW = new Date(0);
const at = (ms: number) => new Date(ms);

const ID_BASE = "00000000-0000-7000-8000-";
let counter = 0;
const nextRawId = () => {
  counter += 1;
  return `${ID_BASE}${counter.toString(16).padStart(12, "0")}`;
};

const OWNER: UserId = "user-owner" as UserId;
const OTHER: UserId = "user-other" as UserId;
const DIR_A: DirectoryId = "dir-a" as DirectoryId;
const DIR_B: DirectoryId = "dir-b" as DirectoryId;

const slugArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/);
const titleArb = fc.stringMatching(/^[a-z]{1,50}$/);

const seed = (overrides: Partial<Parameters<typeof Note.create>[0]> = {}) => ({
  id: nextRawId(),
  ownerId: OWNER,
  directoryId: DIR_A,
  slug: NoteSlug.create("seed"),
  title: NoteTitle.create("Seed"),
  contentHtml: ContentHtml.create("<p>x</p>"),
  frontMatter: FrontMatter.empty(),
  tagIds: [] as readonly TagId[],
  internalLinkRefs: [] as readonly InternalLinkRefType[],
  mediaRefs: [] as readonly MediaAssetId[],
  ...overrides,
});

describe("Note.trash / Note.restore (property)", () => {
  it("restoring a freshly trashed note brings the status back to active", () => {
    fc.assert(
      fc.property(titleArb, (raw) => {
        const { entity } = Note.create(
          seed({ title: NoteTitle.create(raw) }),
          NOW,
        );
        const { entity: trashed } = Note.trash(entity, at(1));
        const { entity: restored } = Note.restore(trashed, null, at(2));
        expect(restored.status).toBe("active");
        expect(restored.directoryId).toBe(entity.directoryId);
      }),
    );
  });

  it("trash -> restore bumps version by 2 each round trip", () => {
    fc.assert(
      fc.property(titleArb, (raw) => {
        const { entity } = Note.create(
          seed({ title: NoteTitle.create(raw) }),
          NOW,
        );
        const { entity: trashed } = Note.trash(entity, at(1));
        const { entity: restored } = Note.restore(trashed, null, at(2));
        expect(trashed.version).toBe(entity.version + 1);
        expect(restored.version).toBe(trashed.version + 1);
      }),
    );
  });
});

describe("Note.rename (property)", () => {
  it("renaming to the same title+slug is a no-op", () => {
    fc.assert(
      fc.property(titleArb, slugArb, (rawT, rawS) => {
        const title = NoteTitle.create(rawT);
        const slug = NoteSlug.create(rawS);
        const { entity } = Note.create(seed({ title, slug }), NOW);
        const { entity: same, eventDrafts } = Note.rename(
          entity,
          title,
          slug,
          at(1),
        );
        expect(same).toBe(entity);
        expect(eventDrafts).toHaveLength(0);
      }),
    );
  });

  it("renaming to a different title bumps version", () => {
    fc.assert(
      fc.property(titleArb, titleArb, slugArb, slugArb, (a, b, s1, s2) => {
        fc.pre(a !== b || s1 !== s2);
        const { entity } = Note.create(
          seed({ title: NoteTitle.create(a), slug: NoteSlug.create(s1) }),
          NOW,
        );
        const { entity: renamed } = Note.rename(
          entity,
          NoteTitle.create(b),
          NoteSlug.create(s2),
          at(1),
        );
        expect(renamed.version).toBe(entity.version + 1);
      }),
    );
  });
});

describe("Note.moveTo (property)", () => {
  it("moving to the same directory is a no-op; moving elsewhere bumps version", () => {
    fc.assert(
      fc.property(fc.constantFrom(DIR_A, DIR_B), (target) => {
        const { entity } = Note.create(seed(), NOW);
        const { entity: moved, eventDrafts } = Note.moveTo(
          entity,
          target,
          at(1),
        );
        if (target === entity.directoryId) {
          expect(moved).toBe(entity);
          expect(eventDrafts).toHaveLength(0);
        } else {
          expect(moved.directoryId).toBe(target);
          expect(moved.version).toBe(entity.version + 1);
          expect(eventDrafts).toHaveLength(1);
        }
      }),
    );
  });
});

describe("Note.acquireEditLock / extendEditLock (property)", () => {
  it("acquireEditLock by the same actor is idempotent in outcome (lock owner unchanged)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (ttl) => {
        const { entity } = Note.create(seed(), NOW);
        const once = Note.acquireEditLock(entity, OWNER, at(1), ttl);
        const twice = Note.acquireEditLock(once, OWNER, at(2), ttl);
        expect(twice.editLock?.userId).toBe(OWNER);
      }),
    );
  });

  it("acquireEditLock with live foreign lock always throws", () => {
    fc.assert(
      fc.property(fc.integer({ min: 60, max: 600 }), (ttl) => {
        const { entity } = Note.create(seed(), NOW);
        const held = Note.acquireEditLock(entity, OTHER, at(1), ttl);
        let threw = false;
        try {
          Note.acquireEditLock(held, OWNER, at(2), ttl);
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
      }),
    );
  });
});
