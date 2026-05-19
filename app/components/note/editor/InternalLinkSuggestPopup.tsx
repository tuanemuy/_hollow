"use client";

import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
import { suggestionKey } from "./internalLinkSuggest";

export type InternalLinkSuggestPopupProps = Readonly<{
  items: readonly InternalLinkSuggestion[];
  selectedIndex: number;
  onSelect: (item: InternalLinkSuggestion) => void;
  onHover: (index: number) => void;
  position: Readonly<{ left: number; top: number }>;
}>;

/**
 * Stateless presentational popup. All state (selected index, items,
 * position) is owned by the TipTap Suggestion plugin glue and pushed in
 * via props. `onMouseDown + preventDefault` is essential — clicking a
 * row would otherwise blur the editor before the suggestion `command`
 * can fire, dismissing the popup. See `.issue/36/adr.md` ADR-003.
 */
export function InternalLinkSuggestPopup({
  items,
  selectedIndex,
  onSelect,
  onHover,
  position,
}: InternalLinkSuggestPopupProps) {
  return (
    <div
      className="internal-link-suggest-popup"
      role="listbox"
      aria-label="内部リンク候補"
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
      }}
    >
      {items.length === 0 ? (
        <div className="suggest-empty">候補なし</div>
      ) : (
        items.map((item, idx) => (
          <button
            key={suggestionKey(item)}
            type="button"
            role="option"
            aria-selected={idx === selectedIndex}
            className={`suggest-row${idx === selectedIndex ? " active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
            onMouseEnter={() => onHover(idx)}
          >
            {item.kind === "note" ? (
              <>
                <span className="suggest-icon">N</span>
                <span className="suggest-title">{item.title}</span>
              </>
            ) : (
              <>
                <span className="suggest-icon">#</span>
                <span className="suggest-title">{item.name}</span>
              </>
            )}
          </button>
        ))
      )}
    </div>
  );
}
