import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";

/**
 * `[[` is the literal text that the user types to invoke the
 * internal-link suggest popup. Kept here as a single source of truth
 * shared between the TipTap Suggestion trigger config and any test
 * fixtures.
 */
export const INTERNAL_LINK_TRIGGER = "[[";

/**
 * Format a selected suggestion into the literal text that gets inserted
 * into the document. Server-side `INTERNAL_LINK_PATTERN` (note) and
 * `HASHTAG_PATTERN` (tag) re-parse this text on save, so this function
 * is the single source of truth for the wire shape produced by the popup.
 *
 * Pure — no editor / DOM dependency — so the format contract is
 * unit-testable without TipTap.
 */
export function formatInternalLinkInsertion(
  suggestion: InternalLinkSuggestion,
): string {
  switch (suggestion.kind) {
    case "note":
      return `[[${suggestion.title}]]`;
    case "tag":
      return `#${suggestion.name}`;
  }
}

/** Wraps around at both ends so the popup never gets stuck. */
export function nextSuggestionIndex(
  current: number,
  direction: "up" | "down",
  total: number,
): number {
  if (total <= 0) return 0;
  const delta = direction === "down" ? 1 : -1;
  return (((current + delta) % total) + total) % total;
}

/**
 * Stable React key — `kind` prefix prevents collisions when a note
 * title equals a tag name.
 */
export function suggestionKey(suggestion: InternalLinkSuggestion): string {
  return suggestion.kind === "note"
    ? `note:${suggestion.noteId}`
    : `tag:${suggestion.tagId}`;
}
