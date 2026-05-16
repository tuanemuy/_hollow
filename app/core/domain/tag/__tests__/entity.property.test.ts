import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Tag } from "../entity";
import { TagName } from "../valueObject";

const NOW = new Date(0);
const ID_BASE = "00000000-0000-7000-8000-";
let counter = 0;
const nextRawId = () => {
  counter += 1;
  return `${ID_BASE}${counter.toString(16).padStart(12, "0")}`;
};
const OWNER = "01950000-0000-7000-8000-000000000fff" as UserId;

const bodyChar = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
);
const nameArb = fc
  .array(bodyChar, { minLength: 1, maxLength: 50 })
  .map((cs) => cs.join(""));

describe("Tag.rename (property)", () => {
  it("renaming to the current canonical name is a no-op (same instance)", () => {
    fc.assert(
      fc.property(nameArb, (body) => {
        const tag = Tag.create(
          { id: nextRawId(), ownerId: OWNER, name: TagName.create(body) },
          NOW,
        );
        const same = Tag.rename(tag, TagName.create(`#${body}`), NOW);
        expect(same).toBe(tag);
        expect(same.version).toBe(tag.version);
      }),
    );
  });

  it("renaming to a different name bumps version by 1 and yields the new name", () => {
    fc.assert(
      fc.property(
        nameArb,
        nameArb.filter((s) => s.length > 0),
        (a, b) => {
          fc.pre(a !== b);
          const tag = Tag.create(
            { id: nextRawId(), ownerId: OWNER, name: TagName.create(a) },
            NOW,
          );
          const renamed = Tag.rename(tag, TagName.create(b), NOW);
          expect(renamed.name as unknown as string).toBe(b);
          expect(renamed.version).toBe(tag.version + 1);
        },
      ),
    );
  });
});

describe("Tag.incrementNoteCount / decrementNoteCount (property)", () => {
  it("increment then decrement returns noteCount to the original value", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (n) => {
        let tag = Tag.create(
          { id: nextRawId(), ownerId: OWNER, name: TagName.create("c") },
          NOW,
        );
        for (let i = 0; i < n; i++) tag = Tag.incrementNoteCount(tag, NOW);
        expect(tag.noteCount).toBe(n);
        for (let i = 0; i < n; i++) tag = Tag.decrementNoteCount(tag, NOW);
        expect(tag.noteCount).toBe(0);
      }),
    );
  });

  it("each mutating call increments version by 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (n) => {
        let tag = Tag.create(
          { id: nextRawId(), ownerId: OWNER, name: TagName.create("v") },
          NOW,
        );
        const startVersion = tag.version;
        for (let i = 0; i < n; i++) tag = Tag.incrementNoteCount(tag, NOW);
        expect(tag.version).toBe(startVersion + n);
      }),
    );
  });
});
