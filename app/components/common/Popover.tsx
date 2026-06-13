"use client";

import type { ReactNode } from "react";
import {
  type PopoverTriggerProps,
  type PopupRole,
  usePopover,
} from "./usePopover";

/**
 * Multi-mode (`role="menu"` / `role="listbox"` / `role="dialog"`) render-prop popover wrapper
 * built on the first-layer `usePopover` (Issue #467 ADR-001). This is the
 * receiver for popovers that own their open state externally and need full
 * control over the panel body — currently the FilterBar's 期間 (dialog) and
 * 公開状態 (menu) chips. The declarative actions-menu sugar lives in `<Menu>`.
 *
 * Below `sm` the panel is intended to become a full-width bottom-anchored
 * sheet (see `popoverSheetPanel` in `common/styles.ts`); when full-width the
 * `clampToViewport` shift (both axes) is unnecessary.
 *
 * Non-modal by design: no focus trap. The trigger is rendered by the caller
 * via the `trigger` render prop (it receives the `ref`, the
 * `aria-haspopup`/`aria-expanded`/`aria-controls` attributes, and an `onClick`
 * toggle); the panel body is `children`, optionally a render prop receiving a
 * `close` callback that restores focus to the trigger.
 */
export type PopoverProps = Readonly<{
  open: boolean;
  onOpenChange: (next: boolean) => void;
  haspopup: PopupRole;
  /** Accessible name for the popover panel. */
  label: string;
  /** Panel chrome / position / width utilities (caller-owned). */
  panelClassName: string;
  /** Opt-in horizontal and vertical viewport clamp (FilterBar). */
  clampToViewport?: boolean | undefined;
  /**
   * Key handler for the `role="menu"` / `role="listbox"` panel
   * (roving-tabindex arrow keys). Not used by the dialog branch.
   */
  onMenuKeyDown?:
    | ((event: React.KeyboardEvent<HTMLDivElement>) => void)
    | undefined;
  /** Ref to the panel element — used by menu consumers for roving focus. */
  panelRef?: ((node: HTMLDivElement | null) => void) | undefined;
  /**
   * Renders `aria-multiselectable="true"` on the `role="listbox"` panel
   * (multi-select listboxes, e.g. the FilterBar tag picker). Listbox mode
   * only; omitted (no attribute) by default.
   */
  multiselectable?: boolean | undefined;
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
}>;

export function Popover({
  open,
  onOpenChange,
  haspopup,
  label,
  panelClassName,
  clampToViewport = false,
  onMenuKeyDown,
  panelRef,
  multiselectable,
  trigger,
  children,
}: PopoverProps) {
  const popover = usePopover({
    open,
    onOpenChange,
    haspopup,
    clampToViewport,
  });

  const assignPanelRef = (node: HTMLDivElement | null) => {
    popover.setPanelRef(node);
    panelRef?.(node);
  };

  const close = popover.closeAndRestoreFocus;
  const body = typeof children === "function" ? children({ close }) : children;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper hosts a trigger button + popover panel and only listens for blur bubbling out of those interactive children; semantics live on the trigger and panel.
    <div
      ref={popover.containerRef}
      className="relative inline-flex"
      onBlur={popover.onFocusOut}
    >
      {trigger(popover.triggerProps)}
      {open ? (
        // onMouseDown preventDefault keeps focus on the active item during
        // mouse interaction: on macOS Safari/Firefox a `<button>` click moves
        // focus to <body>, which would otherwise trigger the container's
        // onBlur → close → click on an unmounted item (the click drops). This
        // matches `<Menu>`'s guard. Menu / listbox mode only — the dialog
        // branch deliberately omits it so form-input focus inside the
        // dialog works. The listbox branch (ViewSwitcher) shares the
        // roving-focus wiring (`onMenuKeyDown`) with menu mode. The two
        // branches stay separate JSX so the `role` is a literal (a11y lint
        // cannot resolve a dynamic role).
        haspopup === "menu" ? (
          <div
            ref={assignPanelRef}
            id={popover.panelId}
            role="menu"
            aria-label={label}
            className={panelClassName}
            style={popover.panelStyle}
            onKeyDown={onMenuKeyDown}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
          >
            {body}
          </div>
        ) : haspopup === "listbox" ? (
          <div
            ref={assignPanelRef}
            id={popover.panelId}
            role="listbox"
            aria-label={label}
            aria-multiselectable={multiselectable || undefined}
            className={panelClassName}
            style={popover.panelStyle}
            onKeyDown={onMenuKeyDown}
            onMouseDown={(event) => {
              // The listbox panel scrolls (max-h + overflow-y); a mousedown
              // on the scrollbar targets the panel itself, and preventDefault
              // there breaks scrollbar dragging on Firefox. Guard only option
              // children.
              if (event.target !== event.currentTarget) {
                event.preventDefault();
              }
            }}
          >
            {body}
          </div>
        ) : (
          <div
            ref={assignPanelRef}
            id={popover.panelId}
            role="dialog"
            aria-label={label}
            className={panelClassName}
            style={popover.panelStyle}
          >
            {body}
          </div>
        )
      ) : null}
    </div>
  );
}
