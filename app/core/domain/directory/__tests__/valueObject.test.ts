import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import { DirectoryErrorCode } from "../errorCode";
import {
  DirectoryDepth,
  DirectoryId,
  DirectoryName,
  DirectoryPath,
  DirectorySlug,
  MAX_DIRECTORY_DEPTH,
} from "../valueObject";

describe("DirectoryId", () => {
  it("throws InvalidId for an empty string", () => {
    try {
      DirectoryId.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.InvalidId);
      }
    }
  });

  it("throws InvalidId for a whitespace-only string", () => {
    try {
      DirectoryId.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.InvalidId);
      }
    }
  });

  it("accepts any non-empty string and trims surrounding whitespace", () => {
    const id = DirectoryId.create("  abc  ");
    expect(id as unknown as string).toBe("abc");
  });
});

describe("DirectoryName", () => {
  it("throws NameEmpty when raw input is empty", () => {
    try {
      DirectoryName.create("");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.NameEmpty);
      }
    }
  });

  it("throws NameEmpty when input is whitespace only", () => {
    try {
      DirectoryName.create("   ");
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.NameEmpty);
      }
    }
  });

  it("throws NameTooLong when length exceeds 80", () => {
    try {
      DirectoryName.create("a".repeat(81));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.NameTooLong);
      }
    }
  });

  it("accepts a name exactly 80 characters long", () => {
    const name = DirectoryName.create("a".repeat(80));
    expect((name as unknown as string).length).toBe(80);
  });

  it.each([
    ["forward slash", "foo/bar"],
    ["backslash", "foo\\bar"],
    ["less than", "foo<bar"],
    ["greater than", "foo>bar"],
    ["colon", "foo:bar"],
    ["pipe", "foo|bar"],
    ["question", "foo?bar"],
    ["asterisk", "foo*bar"],
    ["null byte", "foo\0bar"],
  ])("throws NameForbiddenCharacter for %s", (_label, raw) => {
    try {
      DirectoryName.create(raw);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.NameForbiddenCharacter);
      }
    }
  });

  it("trims surrounding whitespace from the name", () => {
    const name = DirectoryName.create("  hello  ");
    expect(name as unknown as string).toBe("hello");
  });

  it("forRoot returns an empty branded name", () => {
    const root = DirectoryName.forRoot();
    expect(root as unknown as string).toBe("");
  });

  it("equals compares case-insensitively", () => {
    const a = DirectoryName.create("Notes");
    const b = DirectoryName.create("notes");
    const c = DirectoryName.create("other");
    expect(DirectoryName.equals(a, b)).toBe(true);
    expect(DirectoryName.equals(a, c)).toBe(false);
  });
});

describe("DirectorySlug", () => {
  it("accepts an empty slug (root sentinel)", () => {
    const slug = DirectorySlug.create("");
    expect(slug as unknown as string).toBe("");
  });

  it("accepts kebab-case alphanumeric segments", () => {
    const slug = DirectorySlug.create("hello-world-2");
    expect(slug as unknown as string).toBe("hello-world-2");
  });

  it.each([
    "Hello",
    "with space",
    "-leading",
    "trailing-",
    "double--dash",
    "snake_case",
  ])("throws InvalidSlug for %s", (raw) => {
    try {
      DirectorySlug.create(raw);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.InvalidSlug);
      }
    }
  });

  it("fromName lower-cases and converts non-alphanumeric runs into dashes", () => {
    const name = DirectoryName.create("Hello World!");
    const slug = DirectorySlug.fromName(name);
    expect(slug as unknown as string).toBe("hello-world");
  });

  it("fromName returns the root sentinel when nothing survives normalization", () => {
    // A pure-symbol name (would never pass DirectoryName.create) used here
    // only to drive the fallback branch via the loose factory contract.
    const slug = DirectorySlug.fromName("***" as never);
    expect(slug as unknown as string).toBe("");
  });

  it("forRoot returns the empty slug sentinel", () => {
    expect(DirectorySlug.forRoot() as unknown as string).toBe("");
  });
});

describe("DirectoryDepth", () => {
  it("root returns 0", () => {
    expect(DirectoryDepth.root() as number).toBe(0);
  });

  it("create accepts 0..MAX inclusive", () => {
    expect(DirectoryDepth.create(0) as number).toBe(0);
    expect(DirectoryDepth.create(MAX_DIRECTORY_DEPTH) as number).toBe(
      MAX_DIRECTORY_DEPTH,
    );
  });

  it("create throws DepthMismatch for negative or non-integer", () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      try {
        DirectoryDepth.create(bad);
        expect.fail(`should have thrown for ${bad}`);
      } catch (error) {
        expect(isBusinessRuleError(error)).toBe(true);
        if (isBusinessRuleError(error)) {
          expect(error.code).toBe(DirectoryErrorCode.DepthMismatch);
        }
      }
    }
  });

  it("create throws TooDeep when depth exceeds the cap", () => {
    try {
      DirectoryDepth.create(MAX_DIRECTORY_DEPTH + 1);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.TooDeep);
      }
    }
  });

  it("next increments by 1 within bounds", () => {
    const d = DirectoryDepth.create(5);
    expect(DirectoryDepth.next(d) as number).toBe(6);
  });

  it("next throws TooDeep when stepping past MAX", () => {
    const cap = DirectoryDepth.create(MAX_DIRECTORY_DEPTH);
    try {
      DirectoryDepth.next(cap);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.TooDeep);
      }
    }
  });
});

describe("DirectoryPath", () => {
  it("root yields '/'", () => {
    expect(DirectoryPath.root() as unknown as string).toBe("/");
  });

  it("fromSegments with empty list yields '/'", () => {
    expect(DirectoryPath.fromSegments([]) as unknown as string).toBe("/");
  });

  it("fromSegments joins with '/' prefix", () => {
    const a = DirectorySlug.create("foo");
    const b = DirectorySlug.create("bar-baz");
    expect(DirectoryPath.fromSegments([a, b]) as unknown as string).toBe(
      "/foo/bar-baz",
    );
  });
});
