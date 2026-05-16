import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { TagErrorCode } from "../errorCode";
import { TagBlacklistEntry, TagId, TagName } from "../valueObject";

const T0 = new Date(0);

describe("TagId", () => {
  it("throws InvalidId for an empty string", () => {
    try {
      TagId.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.InvalidId);
      }
    }
  });

  it("throws InvalidId for a whitespace-only string", () => {
    try {
      TagId.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.InvalidId);
      }
    }
  });

  it("accepts any non-empty string and returns a branded TagId", () => {
    const raw = "01950000-0000-7000-8000-000000000001";
    const id = TagId.create(raw);
    expect(id as unknown as string).toBe(raw);

    const opaque = TagId.create("not-a-uuid");
    expect(opaque as unknown as string).toBe("not-a-uuid");
  });

  it("trims surrounding whitespace from the returned value", () => {
    const created = TagId.create("  01950000-0000-7000-8000-000000000001  ");
    expect(created as unknown as string).toBe(
      "01950000-0000-7000-8000-000000000001",
    );
  });
});

describe("TagName", () => {
  it("strips a single leading `#` and keeps the body", () => {
    const name = TagName.create("#foo");
    expect(name as unknown as string).toBe("foo");
  });

  it("does not strip `#` from later positions in the string", () => {
    const name = TagName.create("a#b");
    expect(name as unknown as string).toBe("a#b");
  });

  it("normalizes input via NFKC before length / character checks", () => {
    // Fullwidth `Ａ` (U+FF21) NFKC-folds to ASCII `A`.
    const name = TagName.create("Ａ");
    expect(name as unknown as string).toBe("A");
  });

  it("throws NameEmpty when raw input is empty", () => {
    try {
      TagName.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameEmpty);
      }
    }
  });

  it("throws NameEmpty when only a leading `#` is provided (nothing after strip)", () => {
    try {
      TagName.create("#");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameEmpty);
      }
    }
  });

  it("throws NameInvalidChars for embedded whitespace", () => {
    try {
      TagName.create("foo bar");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameInvalidChars);
      }
    }
  });

  it("throws NameInvalidChars for line breaks", () => {
    try {
      TagName.create("foo\nbar");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameInvalidChars);
      }
    }
  });

  it("throws NameTooLong when length after normalisation exceeds 50", () => {
    const raw = "a".repeat(51);
    try {
      TagName.create(raw);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(TagErrorCode.NameTooLong);
      }
    }
  });

  it("accepts a name exactly 50 characters long", () => {
    const raw = "a".repeat(50);
    const name = TagName.create(raw);
    expect((name as unknown as string).length).toBe(50);
  });

  it("`equals` compares canonical form", () => {
    const a = TagName.create("#foo");
    const b = TagName.create("foo");
    expect(TagName.equals(a, b)).toBe(true);
  });
});

describe("TagBlacklistEntry", () => {
  const owner = "01950000-0000-7000-8000-000000000010" as UserId;

  it("`create` carries the supplied fields", () => {
    const name = TagName.create("foo");
    const entry = TagBlacklistEntry.create({
      ownerId: owner,
      name,
      addedAt: T0,
    });
    expect(entry.ownerId).toBe(owner);
    expect(entry.name).toBe(name);
    expect(entry.addedAt.getTime()).toBe(T0.getTime());
  });

  it("`equals` is keyed on (ownerId, name) and ignores addedAt", () => {
    const a = TagBlacklistEntry.create({
      ownerId: owner,
      name: TagName.create("foo"),
      addedAt: T0,
    });
    const b = TagBlacklistEntry.create({
      ownerId: owner,
      name: TagName.create("#foo"),
      addedAt: new Date(T0.getTime() + 1_000),
    });
    expect(TagBlacklistEntry.equals(a, b)).toBe(true);
  });

  it("`equals` returns false for different owner", () => {
    const other = "01950000-0000-7000-8000-000000000011" as UserId;
    const a = TagBlacklistEntry.create({
      ownerId: owner,
      name: TagName.create("foo"),
      addedAt: T0,
    });
    const b = TagBlacklistEntry.create({
      ownerId: other,
      name: TagName.create("foo"),
      addedAt: T0,
    });
    expect(TagBlacklistEntry.equals(a, b)).toBe(false);
  });

  it("`equals` returns false for different name", () => {
    const a = TagBlacklistEntry.create({
      ownerId: owner,
      name: TagName.create("foo"),
      addedAt: T0,
    });
    const b = TagBlacklistEntry.create({
      ownerId: owner,
      name: TagName.create("bar"),
      addedAt: T0,
    });
    expect(TagBlacklistEntry.equals(a, b)).toBe(false);
  });
});
