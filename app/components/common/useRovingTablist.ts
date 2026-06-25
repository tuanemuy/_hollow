"use client";

import { type RefObject, useRef } from "react";

/**
 * Roving-tabindex primitive for an always-visible, horizontally-laid-out
 * segmented control rendered as an APG Radio Group (Issue #660 ADR-002).
 *
 * Why not reuse `useRovingMenu`: that primitive is menu/listbox-only — it is
 * gated on `open` (popovers), drives focus through a `panelRef`, navigates
 * only vertically (ArrowUp/Down), and carries focus-restore / disabled-item
 * concerns a segmented control never needs. A segmented control is always
 * mounted, horizontal (ArrowLeft/Right primary), has a fixed element count,
 * and — per the APG Radio Group pattern — selects immediately on arrow move.
 * Generalizing `useRovingMenu` to cover this would risk the existing
 * menu/listbox call sites (open-reset, focus-restore invariants), so a small
 * dedicated hook is the right scope.
 *
 * Index discipline (same as `useRovingMenu`): the CALLER owns `count` /
 * `selectedIndex` / `onSelect`. The hook's `querySelector('[role="radio"]')`
 * is the focus EXECUTOR only — never the source of truth for counting. The
 * declared order equals the DOM order (the radios are the only
 * `[role="radio"]` descendants of the container), so the caller's index and
 * the DOM index agree; `.focus()` on the target index lands on the right node.
 *
 * The roving tabindex is derived purely from `selectedIndex` (the selected
 * radio is the single tabbable one), so the hook keeps no internal state.
 * Arrow/Home/End move focus to the target radio and call `onSelect(index)`
 * (APG Radio Group: arrow move = immediate selection). Any other key
 * (Tab / Space / Enter / …) is left untouched — no `preventDefault` — so Tab
 * still leaves the group and the native `<button>` Space/Enter activation via
 * the caller's `onClick` is preserved.
 */
export type UseRovingTablistOptions = Readonly<{
  orientation?: "horizontal" | "vertical";
  count: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}>;

export type UseRovingTablist = Readonly<{
  /** Returns `tabIndex` for the radio at `index` (roving: one 0, rest -1). */
  getTabIndex: (index: number) => 0 | -1;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  containerRef: RefObject<HTMLDivElement | null>;
}>;

export function useRovingTablist({
  orientation = "horizontal",
  count,
  selectedIndex,
  onSelect,
}: UseRovingTablistOptions): UseRovingTablist {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";

  const getTabIndex = (index: number): 0 | -1 =>
    index === selectedIndex ? 0 : -1;

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (count === 0) return;
    let next: number | null = null;
    // Both axes are accepted (ArrowRight/Down → next, ArrowLeft/Up → prev) so
    // the control responds the same regardless of declared orientation.
    if (event.key === nextKey || event.key === "ArrowDown")
      next = (selectedIndex + 1) % count;
    else if (event.key === prevKey || event.key === "ArrowUp")
      next = (selectedIndex - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    // Focus executor only — index is caller-owned (see hook JSDoc).
    const radios =
      containerRef.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    radios?.[next]?.focus();
    onSelect(next);
  };

  return { getTabIndex, onKeyDown, containerRef };
}
