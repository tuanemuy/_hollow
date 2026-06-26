"use client";

import { type RefObject, useRef, useState } from "react";

/**
 * Roving-tabindex primitive for an always-visible, horizontally-laid-out
 * segmented control. Serves two APG patterns through a single hook:
 *
 * - **automatic activation** (default) — APG Radio Group (Issue #660
 *   ADR-002/004). Used by `DisplayModeSwitch` / `PublicTopControls`.
 * - **manual activation** — APG Tabs (Issue #776 ADR-002/003). Used by
 *   `EditorModeSwitch`, where switching modes mounts a heavy editor and may
 *   open a confirm dialog, so the APG-recommended manual activation keeps
 *   arrow-key traversal side-effect-free.
 *
 * Why not reuse `useRovingMenu`: that primitive is menu/listbox-only — it is
 * gated on `open` (popovers), drives focus through a `panelRef`, navigates
 * only vertically (ArrowUp/Down), and carries focus-restore / disabled-item
 * concerns a segmented control never needs. A segmented control is always
 * mounted, horizontal (ArrowLeft/Right primary) and has a fixed element
 * count. Generalizing `useRovingMenu` to cover this would risk the existing
 * menu/listbox call sites (open-reset, focus-restore invariants), so a small
 * dedicated hook is the right scope.
 *
 * Index discipline (same as `useRovingMenu`): the CALLER owns `count` /
 * `selectedIndex` / `onSelect`. The hook's `querySelectorAll('[role="radio"],
 * [role="tab"]')` is the focus EXECUTOR only — never the source of truth for
 * counting. The declared order equals the DOM order (the radios/tabs are the
 * only such descendants of the container), so the caller's index and the DOM
 * index agree; `.focus()` on the target index lands on the right node.
 *
 * Two activation paths, one hook:
 * - **automatic:** the roving tabindex is derived purely from `selectedIndex`
 *   (the selected radio is the single tabbable one); the internal
 *   `focusedIndex` state is NOT read on this path. Arrow/Home/End move focus
 *   to the target radio and call `onSelect(index)` immediately (APG Radio
 *   Group: arrow move = selection). Behaviour is identical to the original
 *   stateless hook, so the existing automatic consumers are unchanged.
 * - **manual:** the roving tabindex follows the internal `focusedIndex`
 *   (the currently-focused tab is the single tabbable one). Arrow/Home/End
 *   move focus AND `focusedIndex` only — they never call `onSelect`, so the
 *   selection (and any `onChange` confirm gate) is left untouched. Activation
 *   is the caller's native `<button>` click (Space/Enter). When `selectedIndex`
 *   changes externally (i.e. activation committed), a render-time adjustment
 *   re-syncs `focusedIndex` to it. `focusedIndex` is NOT reset on blur, so
 *   leaving and re-entering the group with Tab returns to the last-focused tab
 *   (standard APG roving-tabindex behaviour).
 *
 * The `useState`/`useRef` hooks are always declared regardless of
 * `manualActivation` (Rules of Hooks); the automatic path simply does not read
 * the resulting `focusedIndex`.
 *
 * Index invariant / safety valve: the "exactly one element is `tabIndex=0`"
 * guarantee depends on `focusedIndex ∈ [0, count)`. `count` is the surface's
 * tab-set size, which is invariant for the lifetime of a mount in every
 * current caller, so this holds. `getTabIndex` nonetheless clamps an
 * out-of-range `focusedIndex` to index 0 so a future variable-`count` caller
 * can never end up with every element `tabIndex=-1` (group unreachable by Tab).
 *
 * Any key other than the navigation keys (Tab / Space / Enter / …) is left
 * untouched — no `preventDefault` — so Tab still leaves the group and the
 * native `<button>` Space/Enter activation via the caller's `onClick` is
 * preserved.
 */
type UseRovingTablistBase = Readonly<{
  orientation?: "horizontal" | "vertical";
  count: number;
  selectedIndex: number;
}>;

/**
 * Automatic activation (APG Radio Group): arrow move selects immediately, so
 * `onSelect` is required. This is the default when `manualActivation` is unset.
 */
type UseRovingTablistAutomatic = UseRovingTablistBase &
  Readonly<{
    manualActivation?: false;
    onSelect: (index: number) => void;
  }>;

/**
 * Manual activation (APG Tabs): arrows move focus only, never selecting, so
 * `onSelect` is unused and optional. Activation is the caller's native click.
 */
type UseRovingTablistManual = UseRovingTablistBase &
  Readonly<{
    manualActivation: true;
    onSelect?: (index: number) => void;
  }>;

export type UseRovingTablistOptions =
  | UseRovingTablistAutomatic
  | UseRovingTablistManual;

export type UseRovingTablist = Readonly<{
  /** Returns `tabIndex` for the element at `index` (roving: one 0, rest -1). */
  getTabIndex: (index: number) => 0 | -1;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  containerRef: RefObject<HTMLDivElement | null>;
}>;

export function useRovingTablist({
  orientation = "horizontal",
  count,
  selectedIndex,
  onSelect,
  manualActivation = false,
}: UseRovingTablistOptions): UseRovingTablist {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Always declared (Rules of Hooks); only read on the manual path.
  const [focusedIndex, setFocusedIndex] = useState(selectedIndex);
  const prevSelectedRef = useRef(selectedIndex);

  // Render-time adjustment (manual only): when the selection commits
  // externally, follow it with the focus. Guarded by the ref compare so it
  // runs once per change and cannot loop.
  if (manualActivation && prevSelectedRef.current !== selectedIndex) {
    prevSelectedRef.current = selectedIndex;
    setFocusedIndex(selectedIndex);
  }

  const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";

  // Clamp guards the index invariant if a future caller varies `count`.
  const activeIndex =
    manualActivation && focusedIndex >= 0 && focusedIndex < count
      ? focusedIndex
      : manualActivation
        ? 0
        : selectedIndex;

  const getTabIndex = (index: number): 0 | -1 =>
    index === activeIndex ? 0 : -1;

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (count === 0) return;
    const base = manualActivation ? activeIndex : selectedIndex;
    let next: number | null = null;
    // Both axes are accepted (ArrowRight/Down → next, ArrowLeft/Up → prev) so
    // the control responds the same regardless of declared orientation.
    if (event.key === nextKey || event.key === "ArrowDown")
      next = (base + 1) % count;
    else if (event.key === prevKey || event.key === "ArrowUp")
      next = (base - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    // Focus executor only — index is caller-owned (see hook JSDoc). Role-
    // agnostic selector so both radiogroup (radio) and tabs (tab) work.
    const items = containerRef.current?.querySelectorAll<HTMLElement>(
      '[role="radio"],[role="tab"]',
    );
    items?.[next]?.focus();
    if (manualActivation) {
      // Manual (APG Tabs): move focus only — selection is left to the caller's
      // native click, so the confirm gate is never tripped by arrow keys.
      setFocusedIndex(next);
    } else {
      // Automatic (APG Radio Group): arrow move = immediate selection.
      onSelect?.(next);
    }
  };

  return { getTabIndex, onKeyDown, containerRef };
}
