import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Tag } from "../entity";
import { TagErrorCode } from "../errorCode";
import { TagId, TagName } from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;
const OWNER = "01950000-0000-7000-8000-000000000fff" as UserId;

const name = (raw: string) => TagName.create(raw);

describe("Tag.create", () => {
  it("creates a tag with version 0, noteCount 0 and matching timestamps", () => {
    const tag = Tag.create(
      { id: rawId(1), ownerId: OWNER, name: name("hello") },
      at(5),
    );
    expect(tag.id as unknown as string).toBe(rawId(1));
    expect(tag.ownerId).toBe(OWNER);
    expect(tag.name as unknown as string).toBe("hello");
    expect(tag.noteCount).toBe(0);
    expect(tag.version).toBe(0);
    expect(tag.createdAt.getTime()).toBe(at(5).getTime());
    expect(tag.updatedAt.getTime()).toBe(at(5).getTime());
  });

  it("validates the supplied id (throws on empty)", () => {
    try {
      Tag.create({ id: "", ownerId: OWNER, name: name("ok") }, T0);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.InvalidId);
      }
    }
  });
});

describe("Tag.rename", () => {
  const fresh = () =>
    Tag.create({ id: rawId(10), ownerId: OWNER, name: name("old") }, T0);

  it("updates the name and bumps version when the name actually changes", () => {
    const original = fresh();
    const renamed = Tag.rename(original, name("new"), at(1));
    expect(renamed.name as unknown as string).toBe("new");
    expect(renamed.version).toBe(original.version + 1);
    expect(renamed.updatedAt.getTime()).toBeGreaterThan(
      original.updatedAt.getTime(),
    );
    // structural fields preserved
    expect(renamed.id).toBe(original.id);
    expect(renamed.ownerId).toBe(original.ownerId);
    expect(renamed.noteCount).toBe(original.noteCount);
    expect(renamed.createdAt.getTime()).toBe(original.createdAt.getTime());
  });

  it("is idempotent when the new name equals the current canonical name (e.g. `#old`)", () => {
    const original = fresh();
    // `#old` canonicalises to `old`, so the rename is a no-op.
    const same = Tag.rename(original, name("#old"), at(5));
    expect(same).toBe(original);
    expect(same.version).toBe(original.version);
    expect(same.updatedAt.getTime()).toBe(original.updatedAt.getTime());
  });
});

describe("Tag.incrementNoteCount / decrementNoteCount", () => {
  const fresh = () =>
    Tag.create({ id: rawId(20), ownerId: OWNER, name: name("c") }, T0);

  it("increment bumps noteCount, version, and updatedAt", () => {
    const tag = fresh();
    const next = Tag.incrementNoteCount(tag, at(1));
    expect(next.noteCount).toBe(1);
    expect(next.version).toBe(tag.version + 1);
    expect(next.updatedAt.getTime()).toBe(at(1).getTime());
  });

  it("decrement bumps version and lowers noteCount", () => {
    const tag = Tag.incrementNoteCount(fresh(), at(1));
    const next = Tag.decrementNoteCount(tag, at(2));
    expect(next.noteCount).toBe(0);
    expect(next.version).toBe(tag.version + 1);
    expect(next.updatedAt.getTime()).toBe(at(2).getTime());
  });

  it("decrement at zero raises BusinessRuleError(NoteCountNegative)", () => {
    const tag = fresh();
    try {
      Tag.decrementNoteCount(tag, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NoteCountNegative);
      }
    }
  });
});

describe("Tag.reconstruct", () => {
  const validRow = () => ({
    id: rawId(100),
    ownerId: OWNER as string,
    name: "rehydrated",
    noteCount: 3,
    version: 4,
    createdAt: T0,
    updatedAt: at(1),
  });

  it("rebuilds an entity from a well-formed persistence row", () => {
    const row = validRow();
    const tag = Tag.reconstruct(row);
    expect(tag.id as unknown as string).toBe(row.id);
    expect(tag.ownerId as unknown as string).toBe(row.ownerId);
    expect(tag.name as unknown as string).toBe("rehydrated");
    expect(tag.noteCount).toBe(3);
    expect(tag.version).toBe(4);
  });

  it("throws RehydrationError (not BusinessRuleError) when stored name is empty", () => {
    try {
      Tag.reconstruct({ ...validRow(), name: "" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
      if (isRehydrationError(error)) {
        expect(isBusinessRuleError(error.cause)).toBe(true);
      }
    }
  });

  it("throws RehydrationError when stored name exceeds 50 chars", () => {
    try {
      Tag.reconstruct({ ...validRow(), name: "a".repeat(51) });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored noteCount is negative", () => {
    try {
      Tag.reconstruct({ ...validRow(), noteCount: -1 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored noteCount is not an integer", () => {
    try {
      Tag.reconstruct({ ...validRow(), noteCount: 1.5 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored version is negative", () => {
    try {
      Tag.reconstruct({ ...validRow(), version: -1 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored id is blank", () => {
    try {
      Tag.reconstruct({ ...validRow(), id: "" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});

describe("Tag id stability", () => {
  it("Tag.create accepts an id with surrounding whitespace and stores it trimmed", () => {
    const padded = `  ${rawId(2)}  `;
    const tag = Tag.create({ id: padded, ownerId: OWNER, name: name("x") }, T0);
    expect(tag.id as unknown as string).toBe(rawId(2));
  });

  it("TagId.create roundtrips a created tag id", () => {
    const tag = Tag.create(
      { id: rawId(3), ownerId: OWNER, name: name("y") },
      T0,
    );
    expect(TagId.create(tag.id)).toBe(tag.id);
  });
});
