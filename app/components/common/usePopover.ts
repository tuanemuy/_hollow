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
 * opt-in horizontal viewport clamp (`shiftX`). It deliberately knows nothing
 * about roving tabindex; that lives in the second-layer `useRovingMenu`.
 *
 * Open/close state is owned by the caller (`open` / `onOpenChange`) so a host
 * can keep multiple popovers mutually exclusive (FilterBar) or own the toggle
 * inline (`<Menu>`).
 */

export const VIEWPORT_MARGIN = 8;

/**
 * `sm` breakpoint (px). Below this width the `popoverSheetPanel` consumers
 * (FilterBar, #588 ADR-003) render the panel as a full-width `max-sm:` sheet,
 * for which the horizontal `clampToViewport` shiftX is meaningless and actively
 * interferes — so the clamp is skipped under this width. This mirrors the
 * `--breakpoint-sm` / `--bp-sm` value (640px) that CLAUDE.md keeps duplicated on
 * purpose; keep it in sync if that token ever changes.
 */
export const POPOVER_SHEET_BREAKPOINT = 640;

/**
 * Pure horizontal-clamp computation extracted for unit testing — happy-dom
 * has no layout, so `getBoundingClientRect()` returns all-zero and the clamp
 * cannot be exercised through the DOM. Given the panel's natural (unshifted)
 * rect and the viewport width, returns the px offset that nudges the panel
 * back inside `[margin, viewportWidth - margin]`. Right-edge overflow is
 * corrected first, then left-edge, mirroring the original FilterPopover logic.
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

export type PopupRole = "dialog" | "menu";

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
   * When true, the panel is nudged horizontally after open so it stays inside
   * the viewport regardless of where the trigger sits (FilterBar). Defaults to
   * false; the `absolute right-0` actions menus do not need it.
   */
  clampToViewport?: boolean;
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
}: UsePopoverOptions): UsePopover {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const [shiftX, setShiftX] = useState(0);

  const setPanelRef = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
  }, []);

  // Measure once per open transition and clamp horizontally. `shiftX` is 0
  // here (reset on the previous close), so the measured rect is the natural,
  // unshifted position and the correction is an absolute value. Runs in a
  // layout effect so the correction is applied before paint (no flicker).
  useLayoutEffect(() => {
    if (!clampToViewport) return;
    if (!open) {
      setShiftX(0);
      return;
    }
    // Below `sm` the sheet consumers render a full-width `max-sm:` panel, so the
    // horizontal shift is both unnecessary and harmful (#588 ADR-003): skip it
    // and leave shiftX at its reset 0.
    if (window.innerWidth < POPOVER_SHEET_BREAKPOINT) return;
    const el = panelRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const shift = computeShiftX(rect, window.innerWidth);
    if (shift !== 0) setShiftX(shift);
  }, [open, clampToViewport]);

  const panelStyle =
    shiftX !== 0 ? { transform: `translateX(${shiftX}px)` } : undefined;

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
