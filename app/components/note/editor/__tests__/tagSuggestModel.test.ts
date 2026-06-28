import { describe, expect, it } from "vitest";
import {
  clampSuggestIndex,
  classifyDraft,
  filterTagSuggestions,
  nextSuggestIndex,
  validateTagDraft,
} from "../tagSuggestModel";

describe("filterTagSuggestions", () => {
  const all = ["react", "redux", "vue", "svelte", "foobarbaz"];

  it("returns [] for an empty / whitespace-only draft (no focus-dump)", () => {
    expect(filterTagSuggestions(all, [], "")).toEqual([]);
    expect(filterTagSuggestions(all, [], "   ")).toEqual([]);
  });

  it("partial-matches existing names case-insensitively", () => {
    expect(filterTagSuggestions(all, [], "re")).toEqual(["react", "redux"]);
    expect(filterTagSuggestions(all, [], "RE")).toEqual(["react", "redux"]);
  });

  it("excludes names already committed", () => {
    expect(filterTagSuggestions(all, ["react"], "re")).toEqual(["redux"]);
  });

  it("excludes a committed `#Foo` from a `Foo` candidate (normalised)", () => {
    expect(filterTagSuggestions(["foobarbaz"], ["#FooBarBaz"], "foo")).toEqual(
      [],
    );
  });

  it("caps the result at the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(filterTagSuggestions(many, [], "tag", 3)).toHaveLength(3);
  });

  it("partial-matches names with query in the middle (substring match)", () => {
    expect(
      filterTagSuggestions(["JavaScript", "TypeScript"], [], "Script"),
    ).toEqual(["JavaScript", "TypeScript"]);
  });
});

describe("classifyDraft", () => {
  const all = ["react", "redux"];

  it("classifies a blank draft as empty", () => {
    expect(classifyDraft(all, [], "")).toBe("empty");
    expect(classifyDraft(all, [], "   ")).toBe("empty");
  });

  it("classifies an exact existing match as exact", () => {
    expect(classifyDraft(all, [], "react")).toBe("exact");
    expect(classifyDraft(all, [], "#React")).toBe("exact");
  });

  it("classifies a committed match as dup", () => {
    expect(classifyDraft(all, ["react"], "react")).toBe("dup");
  });

  it("classifies a fresh name as new", () => {
    expect(classifyDraft(all, [], "angular")).toBe("new");
  });

  it("classifies with normalised committed (strip leading # and case-fold)", () => {
    expect(classifyDraft(all, ["#React"], "react")).toBe("dup");
    expect(classifyDraft(all, ["#React"], "REACT")).toBe("dup");
    expect(classifyDraft(all, ["React"], "#react")).toBe("dup");
  });
});

describe("validateTagDraft", () => {
  it("returns null for blank / whitespace-only drafts (no nag)", () => {
    expect(validateTagDraft("")).toBeNull();
    expect(validateTagDraft("   ")).toBeNull();
  });

  it("returns null for a valid name (with or without leading #)", () => {
    expect(validateTagDraft("foo")).toBeNull();
    expect(validateTagDraft("#foo")).toBeNull();
  });

  it("flags a name over 50 chars", () => {
    expect(validateTagDraft("a".repeat(51))).toBe(
      "タグ名は50文字以内で入力してください",
    );
  });

  it("flags whitespace inside the name", () => {
    expect(validateTagDraft("foo bar")).toBe("タグ名に空白や改行は使えません");
  });

  it("flags an invalid token even when a later token is valid (commit unit)", () => {
    expect(validateTagDraft(`${"a".repeat(51)},ok`)).toBe(
      "タグ名は50文字以内で入力してください",
    );
  });
});

describe("clampSuggestIndex", () => {
  it("preserves the -1 no-active sentinel", () => {
    expect(clampSuggestIndex(-1, 5)).toBe(-1);
    expect(clampSuggestIndex(-3, 5)).toBe(-1);
  });

  it("rounds an over-the-top index down to count-1", () => {
    expect(clampSuggestIndex(5, 5)).toBe(4);
    expect(clampSuggestIndex(99, 3)).toBe(2);
  });

  it("returns -1 for an empty list", () => {
    expect(clampSuggestIndex(2, 0)).toBe(-1);
  });

  it("passes an in-range index through", () => {
    expect(clampSuggestIndex(2, 5)).toBe(2);
  });
});

describe("nextSuggestIndex", () => {
  it("moves from no-active to the first option on ArrowDown (no skip)", () => {
    expect(nextSuggestIndex(-1, "down", 5)).toBe(0);
  });

  it("moves from no-active to the last option on ArrowUp", () => {
    expect(nextSuggestIndex(-1, "up", 5)).toBe(4);
  });

  it("wraps at both ends", () => {
    expect(nextSuggestIndex(4, "down", 5)).toBe(0);
    expect(nextSuggestIndex(0, "up", 5)).toBe(4);
  });

  it("returns -1 for an empty list", () => {
    expect(nextSuggestIndex(-1, "down", 0)).toBe(-1);
  });

  it("navigates correctly with a single candidate (count=1)", () => {
    expect(nextSuggestIndex(-1, "down", 1)).toBe(0);
    expect(nextSuggestIndex(-1, "up", 1)).toBe(0);
    expect(nextSuggestIndex(0, "down", 1)).toBe(0);
    expect(nextSuggestIndex(0, "up", 1)).toBe(0);
  });
});
