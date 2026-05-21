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
      className="z-[200] min-w-[240px] max-w-[320px] rounded-md border border-hairline bg-bg shadow-md py-1"
      role="listbox"
      aria-label="内部リンク候補"
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
      }}
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-sm text-ink-tertiary">候補なし</div>
      ) : (
        items.map((item, idx) => {
          const isActive = idx === selectedIndex;
          return (
            <button
              key={suggestionKey(item)}
              type="button"
              role="option"
              aria-selected={isActive}
              data-active={isActive || undefined}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors motion-reduce:transition-none hover:bg-surface data-[active]:bg-surface"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
              onMouseEnter={() => onHover(idx)}
            >
              {item.kind === "note" ? (
                <>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-xs bg-surface text-xs font-medium text-ink-secondary">
                    N
                  </span>
                  <span className="flex-1 truncate">{item.title}</span>
                </>
              ) : (
                <>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-xs bg-surface text-xs font-medium text-accent">
                    #
                  </span>
                  <span className="flex-1 truncate">{item.name}</span>
                </>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
