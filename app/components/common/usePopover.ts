"use client";

import {
  type Ref,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * First-layer popover primitive (Issue #467 ADR-001). Owns the dismiss
 * behaviour shared by every WAI-ARIA Menu / Popover in the app — outside
 * `mousedown`, `Escape`, and focus-out — plus focus restoration to the
 * trigger, the `aria-haspopup`/`aria-expanded`/`aria-controls` wiring, and an
 * opt-in viewport clamp (`shiftX` horizontal + `shiftY` vertical).
 *
 * Dismiss paths: outside `mousedown` (document listener), `Escape` (document
 * listener, restores trigger focus), Tab-out (focus-out with a non-null
 * `relatedTarget`), and the caller's `closeAndRestoreFocus`. Focus *loss*
 * (focus-out with `relatedTarget: null` — window blur, programmatic
 * `element.blur()`, or React swapping the focused node mid-commit) does NOT
 * close the popover: closing there dismissed multi-select panels
 * mid-interaction. Consequence: the editor-side commit-on-blur calls
 * (`NoteEditor` / `InlineEditor` / `FrontMatterEditor`) no longer dismiss an
 * open popover — acceptable because those blurs fire while focus is in an
 * editor field, i.e. the popover already lost focus through a user-driven
 * (non-null relatedTarget) path beforehand. If a real "close on window blur"
 * need appears, add an explicit `visibilitychange` / window `blur` listener
 * rather than reverting the guard. It deliberately knows nothing about roving
 * tabindex; that lives in the second-layer `useRovingMenu`.
 *
 * Initial focus (`moveInitialFocus`, opt-in) is the symmetric counterpart of
 * the focus restoration above: on the closed→open rising edge it moves focus
 * to the first focusable element inside the panel (Issue #506, dialog mode
 * only). It is off by default and menu/listbox popovers must not enable it —
 * their initial focus is owned by the second-layer roving tabindex
 * (`useRovingMenu`). Consumers that manage panel focus themselves
 * (DirectoryTreeSelect) also leave it off.
 *
 * Open/close state is owned by the caller (`open` / `onOpenChange`) so a host
 * can keep multiple popovers mutually exclusive (FilterBar) or own the toggle
 * inline (`<Menu>`).
 */

export const VIEWPORT_MARGIN = 8;

/**
 * `sm` breakpoint (px). Below this width the `popoverSheetPanel` consumers
 * (FilterBar, #588 ADR-003) render the panel as a full-width `max-sm:` sheet
 * pinned to `max-sm:bottom-0`, for which both the horizontal `shiftX` and the
 * vertical `shiftY` of `clampToViewport` are meaningless and actively interfere
 * with the bottom-sheet layout — so the whole clamp is skipped under this width.
 * This mirrors the `--breakpoint-sm` / `--bp-sm` value (640px) that CLAUDE.md
 * keeps duplicated on purpose; keep it in sync if that token ever changes.
 */
export const POPOVER_SHEET_BREAKPOINT = 640;

/**
 * Pure horizontal-clamp computation extracted for unit testing — happy-dom
 * has no layout, so `getBoundingClientRect()` returns all-zero and the clamp
 * cannot be exercised through the DOM. Given the panel's natural (unshifted)
 * rect and the viewport width, returns the px offset that nudges the panel
 * back inside `[margin, viewportWidth - margin]`. Right-edge overflow is
 * corrected first, then left-edge.
 */
export function computeShiftX(
  rect: Readonly<{ left: number; right: number }>,
  viewportWidth: number,
  margin: number = VIEWPORT_MARGIN,
): number {
  let shift = 0;
  if (rect.right > viewportWidth - margin) {
    shift = viewportWidth - margin - rect.right;
  }
  if (rect.left + shift < margin) {
    shift = margin - rect.left;
  }
  return shift;
}

/**
 * Pure vertical-clamp computation — the symmetric counterpart of
 * `computeShiftX`. happy-dom has no layout, so `getBoundingClientRect()` returns
 * all-zero and the clamp cannot be exercised through the DOM. Given the panel's
 * natural (unshifted) rect and the viewport height, returns the px offset that
 * nudges the panel back inside `[margin, viewportHeight - margin]`. Bottom-edge
 * overflow is corrected first, then top-edge — so when the panel is taller than
 * the viewport (both edges overflow) the top-edge correction wins and the panel
 * head stays visible (its tail remains out of reach, mirroring how
 * `computeShiftX` keeps the left edge / head when the panel is wider than the
 * viewport).
 */
export function computeShiftY(
  rect: Readonly<{ top: number; bottom: number }>,
  viewportHeight: number,
  margin: number = VIEWPORT_MARGIN,
): number {
  let shift = 0;
  if (rect.bottom > viewportHeight - margin) {
    shift = viewportHeight - margin - rect.bottom;
  }
  if (rect.top + shift < margin) {
    shift = margin - rect.top;
  }
  return shift;
}

export type PopupRole = "dialog" | "menu" | "listbox";

// Mirror of `Dialog.tsx`'s non-filtered `FOCUSABLE_SELECTOR`, used to pick the
// initial-focus target inside a dialog-mode panel on open (Issue #506). Unlike
// Dialog's `INITIAL_FOCUS_SELECTOR` (a `:not([data-dialog-close])` filtered
// variant that skips the close button), no exclusion is needed here: the first
// focusable in a DatePopover is a meaningful preset button, so the non-filtered
// form is the right shape. Kept as a local duplicate rather than shared —
// Dialog needs the filtered variant, this needs the unfiltered one, so sharing
// would force a branch at the call site (ADR-001 tradeoff).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

export type PopoverTriggerProps = Readonly<{
  ref: Ref<HTMLButtonElement>;
  "aria-haspopup": PopupRole;
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  onClick: () => void;
}>;

export type UsePopoverOptions = Readonly<{
  open: boolean;
  onOpenChange: (next: boolean) => void;
  haspopup: PopupRole;
  /**
   * When true, the panel is nudged horizontally and vertically after open so it
   * stays inside the viewport regardless of where the trigger sits (FilterBar).
   * Defaults to false; the `absolute right-0` actions menus do not need it.
   */
  clampToViewport?: boolean;
  /**
   * When true, focus moves to the first focusable element inside the panel on
   * each closed→open transition (dialog mode, Issue #506). Defaults to false.
   * Callers gate this to `haspopup === "dialog"`; menu/listbox popovers rely on
   * `useRovingMenu` for initial focus and must leave it off.
   */
  moveInitialFocus?: boolean;
}>;

export type UsePopover = Readonly<{
  panelId: string;
  containerRef: Ref<HTMLDivElement>;
  triggerRef: Ref<HTMLButtonElement>;
  /** Merge into the panel element — wires the clamp measuring ref. */
  setPanelRef: (node: HTMLDivElement | null) => void;
  panelStyle: React.CSSProperties | undefined;
  triggerProps: PopoverTriggerProps;
  onFocusOut: (event: React.FocusEvent<HTMLDivElement>) => void;
  /**
   * Move focus back to the trigger BEFORE closing (Dialog-connection order,
   * #467): when a menuitem's `onSelect` mounts a Dialog, the Dialog's
   * `previousActiveRef` must capture the trigger rather than `<body>` (the
   * menuitem is about to unmount). Order is focus → close. The CALLER is
   * responsible for running its `onSelect()` AFTER this, never before.
   */
  closeAndRestoreFocus: () => void;
}>;

export function usePopover({
  open,
  onOpenChange,
  haspopup,
  clampToViewport = false,
  moveInitialFocus = false,
}: UsePopoverOptions): UsePopover {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const [shiftX, setShiftX] = useState(0);
  const [shiftY, setShiftY] = useState(0);
  // Tracks the last seen `open` so the initial-focus effect below fires only on
  // a real closed→open transition — not on re-renders that keep the panel open.
  // A DatePopover stays open across preset selection → URL navigation (RSC
  // re-render, popover not closed), and the effect can be re-evaluated there;
  // without this edge guard it would yank focus back to the first focusable and
  // steal the user's place. Initial `false` (matching `useRovingMenu`) so a
  // dialog mounted already-open still counts as a rising edge. See #467
  // `useRovingMenu`'s `prevOpenRef` for the same pattern.
  const prevOpenRef = useRef(false);

  const setPanelRef = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
  }, []);

  // Measure once per open transition and clamp both axes. `shiftX`/`shiftY` are
  // 0 here (reset on the previous close), so the measured rect is the natural,
  // unshifted position and each correction is an absolute value. The two axes
  // are independent, so a single `getBoundingClientRect()` feeds both
  // `computeShiftX` and `computeShiftY` (ADR-002 — no separate effect). Runs in
  // a layout effect so the correction is applied before paint (no flicker).
  useLayoutEffect(() => {
    if (!clampToViewport) return;
    if (!open) {
      setShiftX(0);
      setShiftY(0);
      return;
    }
    // Below `sm` the sheet consumers render a full-width `max-sm:bottom-0` panel,
    // so both the horizontal and vertical shift are unnecessary and harmful to
    // the bottom-sheet layout (#588 ADR-003 / AC-4): skip the clamp entirely and
    // leave shiftX/shiftY at their reset 0.
    if (window.innerWidth < POPOVER_SHEET_BREAKPOINT) return;
    const el = panelRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const nextShiftX = computeShiftX(rect, window.innerWidth);
    const nextShiftY = computeShiftY(rect, window.innerHeight);
    if (nextShiftX !== 0) setShiftX(nextShiftX);
    if (nextShiftY !== 0) setShiftY(nextShiftY);
  }, [open, clampToViewport]);

  const panelStyle =
    shiftX !== 0 || shiftY !== 0
      ? { transform: `translate(${shiftX}px, ${shiftY}px)` }
      : undefined;

  // Initial focus (dialog mode, opt-in). Fires only on the closed→open rising
  // edge; on later commits while open (`prevOpenRef` already true) it no-ops so
  // it never pulls focus back from wherever the user moved it. Runs in a
  // useEffect (post-paint) so it does not race the `clampToViewport`
  // useLayoutEffect. `.focus()` works in happy-dom (unlike layout); only the
  // first focusable is taken — no-op when the panel has none.
  useEffect(() => {
    const rising = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!moveInitialFocus || !rising) return;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
  }, [open, moveInitialFocus]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        containerRef.current !== null &&
        containerRef.current.contains(target)
      ) {
        return;
      }
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const onFocusOut = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!open) return;
    const next = event.relatedTarget;
    // `relatedTarget === null` means focus was *lost* (window blur, or React
    // replacing the focused node during a commit — e.g. the RSC re-render
    // after a filter navigation drops focus from a roving-focused option to
    // <body>), not moved by the user. Closing here would dismiss multi-select
    // panels mid-interaction. Real outside interactions still close via the
    // document mousedown listener, and Tab-out carries a non-null
    // relatedTarget.
    if (next === null) return;
    if (next instanceof Node && containerRef.current?.contains(next)) return;
    onOpenChange(false);
  };

  const closeAndRestoreFocus = useCallback(() => {
    triggerRef.current?.focus();
    onOpenChange(false);
  }, [onOpenChange]);

  const triggerProps: PopoverTriggerProps = {
    ref: triggerRef,
    "aria-haspopup": haspopup,
    "aria-expanded": open,
    "aria-controls": open ? panelId : undefined,
    onClick: () => onOpenChange(!open),
  };

  return {
    panelId,
    containerRef,
    triggerRef,
    setPanelRef,
    panelStyle,
    triggerProps,
    onFocusOut,
    closeAndRestoreFocus,
  };
}
