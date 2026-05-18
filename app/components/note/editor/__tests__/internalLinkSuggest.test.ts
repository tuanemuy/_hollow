import { describe, expect, it } from "vitest";
import type { NoteId } from "@/core/application/dto/note";
import type { TagId } from "@/core/application/dto/tag";
import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
import {
  formatInternalLinkInsertion,
  INTERNAL_LINK_TRIGGER,
  nextSuggestionIndex,
  suggestionKey,
} from "../internalLinkSuggest";

const asNoteId = (raw: string): NoteId => raw as unknown as NoteId;
const asTagId = (raw: string): TagId => raw as unknown as TagId;

// These patterns mirror the canonical definitions in the domain
// services. We re-declare them locally rather than re-exporting from
// the domain layer because the formatter is the single source of truth
// for the WIRE FORMAT that the patterns must keep matching.
const INTERNAL_LINK_PATTERN = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;
const HASHTAG_PATTERN = /#([^\s#<>"'`]+)/g;

const noteSuggestion = (
  overrides: Partial<Extract<InternalLinkSuggestion, { kind: "note" }>> = {},
): InternalLinkSuggestion => ({
  kind: "note",
  noteId: asNoteId("note-1"),
  title: "My Note",
  slug: "my-note",
  ...overrides,
});

const tagSuggestion = (
  overrides: Partial<Extract<InternalLinkSuggestion, { kind: "tag" }>> = {},
): InternalLinkSuggestion => ({
  kind: "tag",
  tagId: asTagId("tag-1"),
  name: "draft",
  ...overrides,
});

describe("INTERNAL_LINK_TRIGGER", () => {
  it("is the literal `[[` so the Suggestion plugin and tests agree", () => {
    expect(INTERNAL_LINK_TRIGGER).toBe("[[");
  });
});

describe("formatInternalLinkInsertion", () => {
  it("wraps note suggestions in [[ ... ]]", () => {
    expect(formatInternalLinkInsertion(noteSuggestion({ title: "Foo" }))).toBe(
      "[[Foo]]",
    );
  });

  it("prefixes tag suggestions with #", () => {
    expect(formatInternalLinkInsertion(tagSuggestion({ name: "draft" }))).toBe(
      "#draft",
    );
  });

  it("preserves whitespace inside note titles", () => {
    expect(
      formatInternalLinkInsertion(noteSuggestion({ title: "Foo Bar" })),
    ).toBe("[[Foo Bar]]");
  });

  it("note output is re-extractable by INTERNAL_LINK_PATTERN with matching target", () => {
    const insertion = formatInternalLinkInsertion(
      noteSuggestion({ title: "Hello World" }),
    );
    const matches = [...insertion.matchAll(INTERNAL_LINK_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe("Hello World");
  });

  it("tag output is re-extractable by HASHTAG_PATTERN with matching name", () => {
    const insertion = `${formatInternalLinkInsertion(
      tagSuggestion({ name: "draft" }),
    )} `;
    const matches = [...insertion.matchAll(HASHTAG_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe("draft");
  });
});

describe("nextSuggestionIndex", () => {
  it("returns 0 for empty list regardless of direction", () => {
    expect(nextSuggestionIndex(0, "down", 0)).toBe(0);
    expect(nextSuggestionIndex(5, "up", 0)).toBe(0);
  });

  it("wraps the tail back to the head when moving down", () => {
    expect(nextSuggestionIndex(2, "down", 3)).toBe(0);
  });

  it("wraps the head back to the tail when moving up", () => {
    expect(nextSuggestionIndex(0, "up", 3)).toBe(2);
  });

  it("moves linearly in the middle of the list", () => {
    expect(nextSuggestionIndex(1, "down", 3)).toBe(2);
    expect(nextSuggestionIndex(2, "up", 3)).toBe(1);
  });
});

describe("suggestionKey", () => {
  it("prefixes note keys with `note:`", () => {
    expect(suggestionKey(noteSuggestion({ noteId: asNoteId("abc") }))).toBe(
      "note:abc",
    );
  });

  it("prefixes tag keys with `tag:`", () => {
    expect(suggestionKey(tagSuggestion({ tagId: asTagId("xyz") }))).toBe(
      "tag:xyz",
    );
  });

  it("produces different keys for a note and tag with the same label", () => {
    const noteK = suggestionKey(
      noteSuggestion({ noteId: asNoteId("shared"), title: "shared" }),
    );
    const tagK = suggestionKey(
      tagSuggestion({ tagId: asTagId("shared"), name: "shared" }),
    );
    expect(noteK).not.toBe(tagK);
  });
});
