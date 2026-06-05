"use client";

import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Small non-modal popover used by the FilterBar's 期間 / 公開状態 trigger chips
 * (Issue #476 案2). Owns the open/close dismiss behaviour — outside
 * `mousedown`, `Escape`, and focus-out — plus focus restoration to the
 * trigger on Escape, following the established inline-menu pattern in
 * `note/detail/NoteActionsMenu` (and `directory/DirectoryActionsMenu`,
 * `layout/UserMenu`). Open/close state is owned by the caller so the FilterBar
 * can keep the two popovers mutually exclusive; a general Popover primitive
 * remains a follow-up (ADR-002).
 *
 * Non-modal by design: no focus trap. The trigger chip is rendered by the
 * caller via the `trigger` render prop (it receives the `ref` and the
 * `aria-haspopup`/`aria-expanded`/`aria-controls` attributes); the panel body
 * is `children`.
 */
export type FilterPopoverTriggerProps = Readonly<{
  ref: Ref<HTMLButtonElement>;
  "aria-haspopup": "dialog" | "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
}>;

export type FilterPopoverProps = Readonly<{
  open: boolean;
  onOpenChange: (next: boolean) => void;
  haspopup: "dialog" | "menu";
  /** Accessible name for the popover panel. */
  label: string;
  /**
   * Key handler for the `role="menu"` panel (roving-tabindex arrow keys).
   * Only meaningful when `haspopup === "menu"`.
   */
  onMenuKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Ref to the panel element — used by menu consumers for roving focus. */
  panelRef?: Ref<HTMLDivElement>;
  trigger: (props: FilterPopoverTriggerProps) => ReactNode;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
}>;

// `left-0` anchors the panel to the trigger's left edge; a layout-effect then
// clamps it horizontally into the viewport (`shiftX`). Anchoring alone breaks
// because FilterBar triggers sit anywhere in a wrapping row — a fixed
// `left-0`/`right-0` overflows one side or the other depending on the trigger's
// position (#476: 期間 near the left overflowed the left edge on mobile).
//
// The panel takes a fixed `w-[280px]` rather than `w-max`: a content-sized
// panel balloons to the `max-w` cap because the native `<input type="date">`
// children report a huge intrinsic `max-content` width. A definite width sizes
// both popovers (期間 / 公開状態) consistently; `max-w` still caps it on narrow
// viewports (#476).
const PANEL =
  "absolute left-0 top-full mt-2 z-40 rounded-lg border border-hairline bg-bg shadow-md p-3 w-[280px] max-w-[calc(100vw-2rem)]";

const VIEWPORT_MARGIN = 8;

export function FilterPopover({
  open,
  onOpenChange,
  haspopup,
  label,
  onMenuKeyDown,
  panelRef,
  trigger,
  children,
}: FilterPopoverProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const internalPanelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const [shiftX, setShiftX] = useState(0);

  // Merge the internal measuring ref with the caller-supplied `panelRef`
  // (menu consumers need it for roving focus).
  const assignPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      internalPanelRef.current = node;
      if (typeof panelRef === "function") panelRef(node);
      else if (panelRef != null)
        (panelRef as { current: HTMLDivElement | null }).current = node;
    },
    [panelRef],
  );

  // After opening, nudge the panel horizontally so it stays inside the
  // viewport regardless of where the trigger sits in the wrapping filter row.
  // Runs in a layout effect so the correction is applied before paint (no
  // flicker). The effect runs once per open transition, and `shiftX` is 0 here
  // (reset on the previous close), so the measured rect is the natural,
  // unshifted position and the correction is an absolute value.
  useLayoutEffect(() => {
    if (!open) {
      setShiftX(0);
      return;
    }
    const el = internalPanelRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    let shift = 0;
    if (rect.right > vw - VIEWPORT_MARGIN)
      shift = vw - VIEWPORT_MARGIN - rect.right;
    if (rect.left + shift < VIEWPORT_MARGIN)
      shift = VIEWPORT_MARGIN - rect.left;
    if (shift !== 0) setShiftX(shift);
  }, [open]);

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

  const close = () => {
    onOpenChange(false);
    triggerRef.current?.focus();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper hosts a trigger button + popover panel and only listens for blur bubbling out of those interactive children; semantics live on the trigger and panel.
    <div
      ref={containerRef}
      className="relative inline-flex"
      onBlur={onFocusOut}
    >
      {trigger({
        ref: triggerRef,
        "aria-haspopup": haspopup,
        "aria-expanded": open,
        "aria-controls": open ? panelId : undefined,
      })}
      {open ? (
        haspopup === "menu" ? (
          <div
            ref={assignPanelRef}
            id={panelId}
            role="menu"
            aria-label={label}
            className={PANEL}
            style={panelStyle}
            onKeyDown={onMenuKeyDown}
          >
            {typeof children === "function" ? children({ close }) : children}
          </div>
        ) : (
          <div
            ref={assignPanelRef}
            id={panelId}
            role="dialog"
            aria-label={label}
            className={PANEL}
            style={panelStyle}
          >
            {typeof children === "function" ? children({ close }) : children}
          </div>
        )
      ) : null}
    </div>
  );
}
