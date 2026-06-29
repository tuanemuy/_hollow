"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { computeShiftY } from "@/components/common/usePopover";
import {
  tagChip,
  tagChipRemove,
  tagInputControl,
  tagInputError,
  tagSuggestOption,
  tagSuggestOptionNew,
  tagSuggestPanel,
  tagsField,
  tagsRow,
} from "./styles";
import {
  clampSuggestIndex,
  classifyDraft,
  filterTagSuggestions,
  nextSuggestIndex,
  validateTagDraft,
} from "./tagSuggestModel";

/**
 * Tags editor for P12 (mock `.tags-row`).
 *
 * Renders the committed tags as individually-removable chips and a
 * trailing input inside one bordered, focus-aware container. The two-layer
 * state (`tagNames` committed chips + `draft` in-progress text) lives in
 * the editor reducer; this component is a controlled view that dispatches
 * intent up via `onAddTag` / `onRemoveTag` / `onSetDraft`.
 *
 * Combobox model (ADR-003): the input is `role="combobox"` with an inline
 * `role="listbox"` of existing-tag suggestions (sourced from `suggestions`,
 * filtered by the draft). Real focus stays on the input; ArrowUp/Down move
 * `aria-activedescendant` over the candidate options. Unlike
 * `DirectoryTreeSelect`, the active index starts/re-anchors at `-1` (no
 * active) so Enter on an unhighlighted draft commits the *typed* new tag
 * rather than being hijacked by a partially-matching existing one; a
 * candidate is committed only while it is highlighted. Navigation index
 * maths use the `-1`-aware `clampSuggestIndex` / `nextSuggestIndex` (the
 * `directoryTreeModel` helpers assume a lower bound of 0 and are
 * incompatible).
 *
 * The "create new" row is a non-interactive indicator (not a
 * `role="option"`) so the activedescendant index stays in lockstep with
 * the candidate count; the new tag is committed via the `activeIndex===-1`
 * Enter path, not by selecting that row.
 *
 * Keyboard: Enter / comma commit (IME-safe — a keystroke fired while a
 * kana→kanji conversion is being confirmed is ignored); ArrowUp/Down
 * navigate candidates (also IME-guarded); Escape closes the panel keeping
 * the draft; Backspace on an empty draft removes the last chip. Invalid
 * drafts are not committed (AC-6 preview; save-time `TagName.create` is the
 * authority).
 */
export type TagsInputProps = Readonly<{
  tagNames: readonly string[];
  draft: string;
  onAddTag: (value: string) => void;
  onRemoveTag: (name: string) => void;
  onSetDraft: (value: string) => void;
  suggestions?: readonly string[];
  disabled?: boolean;
}>;

export function TagsInput({
  tagNames,
  draft,
  onAddTag,
  onRemoveTag,
  onSetDraft,
  suggestions = [],
  disabled = false,
}: TagsInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [shiftY, setShiftY] = useState(0);

  const listboxId = useId();
  const optionIdBase = useId();
  const errorId = useId();
  const optionRefs = useRef<(HTMLElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Mirrors the applied `shiftY` for the layout effect to read without making it
  // a dependency (ADR-005) — see the clamp effect below.
  const shiftYRef = useRef(0);

  const candidates = useMemo(
    () => filterTagSuggestions(suggestions, tagNames, draft),
    [suggestions, tagNames, draft],
  );
  const classification = classifyDraft(suggestions, tagNames, draft);
  const validationError = validateTagDraft(draft);
  const isNewDraft = classification === "new" && validationError === null;

  const hasSuggestions = candidates.length > 0;
  // aria-expanded reflects panelOpen (visible state), not just `open`. On Escape
  // or blur, `open` becomes false and aria-expanded immediately becomes false too,
  // ensuring consistency even when only the "create new" row is visible.
  const panelOpen = open && (hasSuggestions || isNewDraft);

  // Re-anchor to "no active" whenever the draft changes; combined with
  // `clampSuggestIndex` (which keeps `-1`) the length effect below cannot
  // push this back to 0.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-anchor is keyed on draft only.
  useEffect(() => {
    setActiveIndex(-1);
  }, [draft]);

  // Keep the active index in range as the candidate set changes, preserving
  // the `-1` sentinel for an empty / unselected list.
  useEffect(() => {
    setActiveIndex((current) => clampSuggestIndex(current, candidates.length));
  }, [candidates.length]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = optionRefs.current[activeIndex];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex]);

  // Vertical viewport clamp (shift): nudge the panel up before paint when its
  // bottom overflows the viewport. Re-measures while open as the candidate
  // count / new-draft row changes the panel height (AC-3), so the measured rect
  // already carries the previously-applied transform. `computeShiftY` requires a
  // natural (unshifted) rect, so we subtract the applied shift (read from
  // `shiftYRef`, never re-measuring the same height) to restore it before
  // clamping (ADR-004 compensation; ADR-005 ref wiring — keeping `shiftY` out of
  // the deps runs this once per height change and avoids the transform-feedback
  // loop that happy-dom would otherwise trigger).
  // biome-ignore lint/correctness/useExhaustiveDependencies: candidates.length / isNewDraft are not read in the body; they are intentional re-measure triggers (both change the panel height).
  useLayoutEffect(() => {
    if (!panelOpen) {
      shiftYRef.current = 0;
      setShiftY(0);
      return;
    }
    const el = panelRef.current;
    if (el === null) return;
    const applied = shiftYRef.current;
    const rect = el.getBoundingClientRect();
    const next = computeShiftY(
      { top: rect.top - applied, bottom: rect.bottom - applied },
      window.innerHeight,
    );
    shiftYRef.current = next;
    setShiftY(next);
  }, [panelOpen, candidates.length, isNewDraft]);

  // Explicit outside-click close (ADR-003): subscribe only while the panel is
  // open. Closing here calls the state setters directly (stable identities) so
  // the listener is keyed on `panelOpen` alone and is not re-attached on every
  // draft keystroke.
  useEffect(() => {
    if (!panelOpen) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        containerRef.current !== null &&
        containerRef.current.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [panelOpen]);

  const activeOptionId =
    open && hasSuggestions && activeIndex >= 0
      ? `${optionIdBase}-${activeIndex}`
      : undefined;

  const closePanel = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (event.nativeEvent.isComposing) return;
      if (!hasSuggestions) {
        if (event.key === "ArrowDown") setOpen(true);
        return;
      }
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? "down" : "up";
      setActiveIndex((current) =>
        nextSuggestIndex(current, direction, candidates.length),
      );
      return;
    }
    if (event.key === "Enter" || event.key === ",") {
      // IME-safe: skip the key fired while a conversion is being confirmed.
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      // A highlighted candidate (Enter only) commits that existing tag.
      if (event.key === "Enter" && hasSuggestions && activeIndex >= 0) {
        const name = candidates[activeIndex];
        if (name !== undefined) {
          onAddTag(name);
          closePanel();
        }
        return;
      }
      // Otherwise commit the typed draft — but only when it is valid
      // (invalid drafts stay in the field; save-time is the authority).
      if (draft.trim().length === 0) return;
      if (validationError !== null) return;
      onAddTag(draft);
      closePanel();
      return;
    }
    if (event.key === "Escape") {
      if (panelOpen) event.preventDefault();
      closePanel();
      return;
    }
    if (event.key === "Backspace" && draft === "" && tagNames.length > 0) {
      event.preventDefault();
      const last = tagNames[tagNames.length - 1];
      if (last !== undefined) onRemoveTag(last);
    }
  };

  return (
    <div className={tagsField}>
      {/* biome-ignore lint/a11y/useSemanticElements: role="group" labels the tags field (chips + combobox); <fieldset> carries form-control semantics inappropriate here (mirrors FilterBar). */}
      <div
        ref={containerRef}
        className={tagsRow}
        role="group"
        aria-label="タグ"
      >
        {tagNames.map((name) => (
          <span key={name} className={tagChip}>
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
          </span>
        ))}
        <input
          type="text"
          className={tagInputControl}
          value={draft}
          aria-label="新規タグ"
          placeholder="タグを追加…"
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={panelOpen}
          {...(open && hasSuggestions ? { "aria-controls": listboxId } : {})}
          {...(activeOptionId !== undefined
            ? { "aria-activedescendant": activeOptionId }
            : {})}
          {...(validationError !== null ? { "aria-describedby": errorId } : {})}
          onChange={(e) => {
            onSetDraft(e.target.value);
            if (!disabled) setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          // Commit a non-empty *valid* draft on blur so a tag typed and then
          // abandoned (clicking elsewhere) is not silently lost. Option
          // clicks use `onMouseDown preventDefault` so they do not steal
          // focus and trip this.
          onBlur={() => {
            if (draft.trim().length > 0 && validationError === null) {
              onAddTag(draft);
            }
            setOpen(false);
          }}
        />

        {panelOpen ? (
          <div
            ref={panelRef}
            className={tagSuggestPanel}
            style={
              shiftY ? { transform: `translateY(${shiftY}px)` } : undefined
            }
          >
            {hasSuggestions ? (
              <div id={listboxId} role="listbox" aria-label="タグ候補">
                {candidates.map((name, index) => {
                  const isActive = index === activeIndex;
                  const optionId = `${optionIdBase}-${index}`;
                  return (
                    <button
                      key={name}
                      id={optionId}
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isActive}
                      data-active={isActive || undefined}
                      className={tagSuggestOption}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onAddTag(name);
                        closePanel();
                      }}
                    >
                      #{name}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {isNewDraft ? (
              // Non-interactive indicator only. The new tag is committed via the
              // `activeIndex===-1` Enter path (L158), not by selecting this row,
              // so we avoid a duplicate affordance by keeping it outside the
              // option navigation and hiding from screen readers.
              <div className={tagSuggestOptionNew} aria-hidden="true">
                ＋「{draft.trim()}」を新規作成
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {validationError !== null ? (
        <p id={errorId} className={tagInputError} aria-live="polite">
          {validationError}
        </p>
      ) : null}
    </div>
  );
}
