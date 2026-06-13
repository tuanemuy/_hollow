"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Second-layer roving-tabindex primitive (Issue #467 ADR-001) — menu-mode
 * only. Tracks the active item index, mirrors it into real DOM `.focus()`
 * whenever the menu is open, and handles Arrow / Home / End navigation.
 *
 * Index discipline: the CALLER owns `itemCount` and the
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
  /**
   * Opt-in focus-restore pass for panels that stay open across selections
   * (multi-select listboxes). When a React commit swaps the focused item node
   * and drops focus to `<body>` (e.g. the RSC re-render after a filter
   * navigation), the pass refocuses the active item after the commit.
   * Off by default: single-select consumers close on selection
   * and must not have focus pulled back into the panel by unrelated
   * re-renders while `<body>` happens to hold focus.
   */
  restoreFocusOnCommit?: boolean;
  /**
   * Reports whether the item at `index` is non-operable (e.g. an
   * `aria-disabled` option). Such items are skipped by Arrow / Home / End and
   * never receive programmatic focus, so the keyboard never lands on a "focused
   * but does nothing" item. Defaults to "nothing disabled". The item still
   * renders (with `aria-disabled`) — this only removes it from the roving
   * traversal, not from the DOM.
   */
  isDisabled?: (index: number) => boolean;
}>;

export type UseRovingMenu = Readonly<{
  activeIndex: number;
  /** Returns `tabIndex` for the item at `index` (roving: one 0, rest -1). */
  getTabIndex: (index: number) => 0 | -1;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  /**
   * Moves the roving active index. Needed by panels that stay open after a
   * click (multi-select listboxes): the panel's mousedown preventDefault
   * keeps focus where it was, so without this an option click would leave
   * `activeIndex` stale and the next ArrowDown would jump from the old spot.
   */
  setActiveIndex: (index: number) => void;
}>;

const noneDisabled = () => false;

export function useRovingMenu({
  open,
  itemCount,
  panelRef,
  itemRole = "menuitem",
  initialIndex = 0,
  restoreFocusOnCommit = false,
  isDisabled = noneDisabled,
}: UseRovingMenuOptions): UseRovingMenu {
  // Resolve a landing index that skips disabled items: prefer the requested
  // index, else scan forward, else backward. Falls back to the requested index
  // when every item is disabled (nothing operable to land on).
  const enabledFrom = useCallback(
    (index: number): number => {
      if (itemCount === 0) return index;
      if (!isDisabled(index)) return index;
      for (let i = index + 1; i < itemCount; i++) {
        if (!isDisabled(i)) return i;
      }
      for (let i = index - 1; i >= 0; i--) {
        if (!isDisabled(i)) return i;
      }
      return index;
    },
    [itemCount, isDisabled],
  );

  const [activeIndex, setActiveIndex] = useState(() =>
    enabledFrom(initialIndex),
  );
  // Tracks the last seen `open` so the reset below only fires on a real
  // closed → open transition. Effects can re-fire WITHOUT a dep change when
  // the subtree is suspended and resumed (e.g. the RSC re-render after a
  // filter navigation while a multi-select listbox stays open); resetting
  // there would clobber the roving position mid-interaction.
  const prevOpenRef = useRef(false);

  // On (re)open, reset the active index to the desired landing item (skipping
  // disabled items so focus never opens onto a non-operable option).
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;
    setActiveIndex(enabledFrom(initialIndex));
  }, [open, initialIndex, enabledFrom]);

  // If the active item became disabled mid-interaction (e.g. the cap was
  // reached on a different option, disabling the currently-focused unselected
  // one), redirect to the nearest enabled item so the roving focus never rests
  // on a non-operable option.
  useEffect(() => {
    if (!open) return;
    if (!isDisabled(activeIndex)) return;
    const target = enabledFrom(activeIndex);
    if (target !== activeIndex) setActiveIndex(target);
  }, [open, activeIndex, isDisabled, enabledFrom]);

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

  // Focus-restore pass (opt-in via `restoreFocusOnCommit`), run after EVERY
  // commit (no dep array) while open. Panels that stay open across selections
  // (multi-select listboxes) lose focus to <body> when a React commit swaps
  // the focused item node — e.g. the RSC re-render after a filter
  // navigation — leaving the roving arrow keys dead. The drop happens
  // inside the commit (its `focusout` carries `relatedTarget: null` and the
  // panel ref is detached mid-commit), so the only reliable hook point is
  // "after a commit, refs re-attached": check and refocus here. The
  // activeElement guard keeps this from stealing focus on window blur (there
  // the item stays activeElement) or from a user who moved focus elsewhere
  // (then activeElement is that element, not <body>). The index is clamped
  // because the item set may have shrunk in the very commit that dropped
  // focus (filter navigation can change the option list); a stale
  // out-of-range index would leave the arrow keys dead again.
  useEffect(() => {
    if (!restoreFocusOnCommit) return;
    if (!open) return;
    if (document.activeElement !== document.body) return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>(
      `[role="${itemRole}"]`,
    );
    if (!items || items.length === 0) return;
    const clamped = Math.min(activeIndex, items.length - 1);
    if (clamped !== activeIndex) setActiveIndex(clamped);
    // preventScroll: the restore may race a user scroll (e.g. dragging the
    // panel scrollbar while an optimistic navigation settles); the default
    // scroll-into-view would yank the list back to the refocused option.
    items[clamped]?.focus({ preventScroll: true });
  });

  // Step `step` items at a time, wrapping, skipping disabled items. Returns the
  // current index if no enabled item exists in the direction (full wrap fails).
  const stepEnabled = (from: number, step: 1 | -1, count: number): number => {
    let i = from;
    for (let n = 0; n < count; n++) {
      i = (i + step + count) % count;
      if (!isDisabled(i)) return i;
    }
    return from;
  };

  // First / last enabled item, for Home / End.
  const firstEnabled = (count: number): number => {
    for (let i = 0; i < count; i++) if (!isDisabled(i)) return i;
    return activeIndex;
  };
  const lastEnabled = (count: number): number => {
    for (let i = count - 1; i >= 0; i--) if (!isDisabled(i)) return i;
    return activeIndex;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const count = itemCount;
    if (count === 0) return;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = stepEnabled(activeIndex, 1, count);
    else if (event.key === "ArrowUp")
      next = stepEnabled(activeIndex, -1, count);
    else if (event.key === "Home") next = firstEnabled(count);
    else if (event.key === "End") next = lastEnabled(count);
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
  };

  const getTabIndex = (index: number): 0 | -1 =>
    index === activeIndex ? 0 : -1;

  return { activeIndex, getTabIndex, onKeyDown, setActiveIndex };
}
