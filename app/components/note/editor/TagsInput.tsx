"use client";

import { tagChip, tagChipRemove, tagInputControl, tagsRow } from "./styles";

/**
 * Tags editor for P12 (mock `.tags-row`, Issue #689 ADR-002).
 *
 * Renders the committed tags as individually-removable chips followed by
 * a trailing borderless input. The two-layer state (`tagNames` committed
 * chips + `draft` in-progress text) lives in the editor reducer; this
 * component is a controlled view that dispatches intent up via
 * `onAddTag` / `onRemoveTag` / `onSetDraft`.
 *
 * Keyboard: Enter / comma commit the draft (IME-safe — a keystroke fired
 * while a kana→kanji conversion is being confirmed is ignored); Backspace
 * on an empty draft removes the last chip. The chip `×` buttons remove a
 * specific tag.
 */
export type TagsInputProps = Readonly<{
  tagNames: readonly string[];
  draft: string;
  onAddTag: (value: string) => void;
  onRemoveTag: (name: string) => void;
  onSetDraft: (value: string) => void;
  disabled?: boolean;
}>;

export function TagsInput({
  tagNames,
  draft,
  onAddTag,
  onRemoveTag,
  onSetDraft,
  disabled = false,
}: TagsInputProps) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      // IME-safe: skip the key fired while a conversion is being confirmed.
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (draft.trim().length === 0) return;
      onAddTag(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && tagNames.length > 0) {
      event.preventDefault();
      const last = tagNames[tagNames.length - 1];
      if (last !== undefined) onRemoveTag(last);
    }
  };

  return (
    <ul className={tagsRow} aria-label="タグ">
      {tagNames.map((name) => (
        <li key={name} className={tagChip}>
          #{name}
          <button
            type="button"
            className={tagChipRemove}
            aria-label={`${name} を削除`}
            disabled={disabled}
            onClick={() => onRemoveTag(name)}
          >
            ×
          </button>
        </li>
      ))}
      <li className="flex min-w-[140px] flex-1">
        <input
          type="text"
          className={tagInputControl}
          value={draft}
          aria-label="新規タグ"
          placeholder="タグを追加…"
          disabled={disabled}
          onChange={(e) => onSetDraft(e.target.value)}
          onKeyDown={onKeyDown}
          // Commit a non-empty draft on blur so a tag typed and then abandoned
          // (clicking elsewhere) is not silently lost before save.
          onBlur={() => {
            if (draft.trim().length > 0) onAddTag(draft);
          }}
        />
      </li>
    </ul>
  );
}
