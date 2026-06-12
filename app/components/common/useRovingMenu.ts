"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Second-layer roving-tabindex primitive (Issue #467 ADR-001) — menu-mode
 * only. Tracks the active item index, mirrors it into real DOM `.focus()`
 * whenever the menu is open, and handles Arrow / Home / End navigation.
 *
 * Index discipline (#467 plan ステップ4): the CALLER owns `itemCount` and the
 * per-item index — `<Menu>` derives them from `Children.toArray` MenuItem
 * extraction, VisibilityPopover from the `VISIBILITY_OPTIONS` map index. This
 * hook's `querySelectorAll` is used ONLY to execute programmatic focus, never
 * as the source of truth for counting/indexing. The declared order equals the
 * DOM order (menu items are the only `[role=itemRole]` descendants), so the
 * caller's index and the DOM index agree.
 */
export type UseRovingMenuOptions = Readonly<{
  open: boolean;
  itemCount: number;
  panelRef: RefObject<HTMLElement | null>;
  /**
   * `menuitem` for actions menus, `menuitemradio` for the visibility filter,
   * `option` for `role="listbox"` popovers (ViewSwitcher).
   */
  itemRole?: "menuitem" | "menuitemradio" | "option";
  /**
   * Index to land focus on when the menu opens. Defaults to 0; the visibility
   * filter passes the currently-selected option so focus lands there.
   */
  initialIndex?: number;
}>;

export type UseRovingMenu = Readonly<{
  activeIndex: number;
  /** Returns `tabIndex` for the item at `index` (roving: one 0, rest -1). */
  getTabIndex: (index: number) => 0 | -1;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}>;

export function useRovingMenu({
  open,
  itemCount,
  panelRef,
  itemRole = "menuitem",
  initialIndex = 0,
}: UseRovingMenuOptions): UseRovingMenu {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // On (re)open, reset the active index to the desired landing item.
  useEffect(() => {
    if (!open) return;
    setActiveIndex(initialIndex);
  }, [open, initialIndex]);

  // Roving tabindex: mirror `activeIndex` into real DOM focus while open.
  // querySelectorAll is the focus executor only — counting/indexing is the
  // caller's responsibility (see hook JSDoc).
  useEffect(() => {
    if (!open) return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>(
      `[role="${itemRole}"]`,
    );
    items?.[activeIndex]?.focus();
  }, [open, activeIndex, panelRef, itemRole]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const count = itemCount;
    if (count === 0) return;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (activeIndex + 1) % count;
    else if (event.key === "ArrowUp") next = (activeIndex - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
  };

  const getTabIndex = (index: number): 0 | -1 =>
    index === activeIndex ? 0 : -1;

  return { activeIndex, getTabIndex, onKeyDown };
}
