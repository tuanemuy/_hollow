/**
 * Pure suggestion / navigation logic for the editor's tag combobox
 * (`TagsInput`).
 *
 * Split out from the component so the candidate filtering, draft
 * classification, inline validation and the `aria-activedescendant`
 * navigation maths are unit-testable without a DOM.
 *
 * Two normalisation concerns live here and are intentionally distinct:
 * - *Matching* (filter / classify) compares the draft against existing
 *   and committed names using a canonical key (NFKC + leading-`#` strip +
 *   case-fold). This mirrors the comparison subset of `TagName`'s
 *   canonical form so `#Foo`, `Foo` and `ｆｏｏ` collapse together.
 * - *Validation* (`validateTagDraft`) is delegated wholesale to
 *   `TagName.create` so the editor never re-implements the domain rules
 *   (ADR-002); it only maps the thrown `code` to a JP message.
 */

import { BusinessRuleError } from "@/core/domain/error";
import { TagErrorCode } from "@/core/domain/tag/errorCode";
import { TagName } from "@/core/domain/tag/valueObject";
import { parseTagInput } from "./editorState";

const DEFAULT_SUGGESTION_LIMIT = 8;

/**
 * Canonical comparison key: NFKC normalise, strip a single leading `#`,
 * case-fold. Mirrors the comparison-relevant subset of `TagName`'s
 * canonicalisation (length / whitespace rules are validation concerns and
 * stay in `validateTagDraft` → `TagName.create`). Total (never throws) so
 * an in-progress, not-yet-valid draft can still drive matching.
 */
function matchKey(raw: string): string {
  const normalised = raw.normalize("NFKC");
  const withoutHash = normalised.startsWith("#")
    ? normalised.slice(1)
    : normalised;
  return withoutHash.toLowerCase();
}

/**
 * Build the set of canonical keys for already-committed chips. `committed`
 * is reducer-owned raw text (`#Foo`, full-width, …); invalid entries are
 * skipped via `TagName.create` so a malformed committed value cannot
 * accidentally suppress a legitimate suggestion.
 */
function committedKeySet(committed: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const name of committed) {
    try {
      TagName.create(name);
    } catch {
      continue;
    }
    set.add(matchKey(name));
  }
  return set;
}

/**
 * Existing tag names that partial-match the current `draft`, excluding any
 * already committed, capped at `limit`. Comparison runs through the
 * canonical key on both sides so normalisation variants collapse.
 *
 * Contract: an empty / whitespace-only draft returns `[]` — focusing the
 * input (without typing) must not dump every tag, and the empty-prefix
 * would otherwise match everything. Suggestions appear only once the user
 * starts typing.
 */
export function filterTagSuggestions(
  allNames: readonly string[],
  committed: readonly string[],
  draft: string,
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): readonly string[] {
  const query = matchKey(draft.trim());
  if (query.length === 0) return [];

  const excluded = committedKeySet(committed);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of allNames) {
    if (out.length >= limit) break;
    const key = matchKey(name);
    if (key.length === 0) continue;
    if (excluded.has(key)) continue;
    if (seen.has(key)) continue;
    if (!key.includes(query)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export type DraftClassification = "empty" | "exact" | "dup" | "new";

/**
 * Classify the current draft for the AC-5 "existing match vs new tag"
 * display split:
 * - `empty`  — blank / whitespace-only.
 * - `dup`    — canonical match of an already-committed chip.
 * - `exact`  — canonical match of an existing (not-committed) tag.
 * - `new`    — non-blank and matches neither.
 *
 * Uses the lenient `matchKey` so it never throws; whether a `new` draft is
 * actually a *valid* new tag is a separate question answered by
 * `validateTagDraft` (the component gates the "create new" affordance on
 * both).
 */
export function classifyDraft(
  allNames: readonly string[],
  committed: readonly string[],
  draft: string,
): DraftClassification {
  const key = matchKey(draft.trim());
  if (key.length === 0) return "empty";
  if (committedKeySet(committed).has(key)) return "dup";
  for (const name of allNames) {
    if (matchKey(name) === key) return "exact";
  }
  return "new";
}

const TAG_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [TagErrorCode.NameEmpty]: "タグ名を入力してください",
  [TagErrorCode.NameInvalidChars]: "タグ名に空白や改行は使えません",
  [TagErrorCode.NameTooLong]: "タグ名は50文字以内で入力してください",
};

/**
 * Inline validation preview for a draft, mapping `TagName.create`'s thrown
 * `code` to a JP message. Returns `null` when the draft is valid — or when
 * it is blank / whitespace-only (a permanently-on "enter a tag name" under
 * an empty field would be noise; AC-6 asks for feedback on length / invalid
 * chars).
 *
 * Validates every comma-split token (the commit unit, per `parseTagInput`),
 * not just the tail, so a pasted "valid,INVALID" cannot slip an invalid
 * chip past the preview. Authority over rejection still lives at save-time
 * value-object construction (this is preview only).
 */
export function validateTagDraft(draft: string): string | null {
  if (draft.trim().length === 0) return null;
  const tokens = parseTagInput(draft);
  if (tokens.length === 0) return null;
  for (const token of tokens) {
    try {
      TagName.create(token);
    } catch (error) {
      if (error instanceof BusinessRuleError && error.code !== null) {
        return TAG_ERROR_MESSAGES[error.code] ?? "タグ名が正しくありません";
      }
      return "タグ名が正しくありません";
    }
  }
  return null;
}

/**
 * Clamp an active index, *preserving the `-1` (no-active) sentinel*. Unlike
 * `directoryTreeModel.clampActiveIndex` (lower bound 0), this keeps `-1`
 * intact and only rounds an over-the-top index down to `count - 1`; an
 * empty list collapses to `-1`. Required so a draft-change reset to `-1`
 * is not pushed back to `0` by the count-change clamp effect.
 */
export function clampSuggestIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  if (index < 0) return -1;
  if (index > count - 1) return count - 1;
  return index;
}

/**
 * Next active index for ArrowDown / ArrowUp over a `-1`-anchored listbox.
 * From the no-active state (`current < 0`) ArrowDown lands on the first
 * option (`0`, never skipping it) and ArrowUp on the last (`count - 1`);
 * otherwise it wraps like a native listbox. An empty list stays `-1`.
 */
export function nextSuggestIndex(
  current: number,
  direction: "up" | "down",
  count: number,
): number {
  if (count <= 0) return -1;
  if (current < 0) return direction === "down" ? 0 : count - 1;
  if (direction === "down") return (current + 1) % count;
  return (current - 1 + count) % count;
}
