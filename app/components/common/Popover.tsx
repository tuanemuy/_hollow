"use client";

import type { ReactNode } from "react";
import {
  type PopoverTriggerProps,
  type PopupRole,
  usePopover,
} from "./usePopover";

/**
 * Dual-mode (`role="menu"` / `role="dialog"`) render-prop popover wrapper
 * built on the first-layer `usePopover` (Issue #467 ADR-001). This is the
 * receiver for popovers that own their open state externally and need full
 * control over the panel body — currently the FilterBar's 期間 (dialog) and
 * 公開状態 (menu) chips. The declarative actions-menu sugar lives in `<Menu>`.
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
  /** Opt-in horizontal viewport clamp (FilterBar). */
  clampToViewport?: boolean | undefined;
  /**
   * Key handler for the `role="menu"` panel (roving-tabindex arrow keys).
   * Only meaningful when `haspopup === "menu"`.
   */
  onMenuKeyDown?:
    | ((event: React.KeyboardEvent<HTMLDivElement>) => void)
    | undefined;
  /** Ref to the panel element — used by menu consumers for roving focus. */
  panelRef?: ((node: HTMLDivElement | null) => void) | undefined;
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
        haspopup === "menu" ? (
          <div
            ref={assignPanelRef}
            id={popover.panelId}
            role="menu"
            aria-label={label}
            className={panelClassName}
            style={popover.panelStyle}
            onKeyDown={onMenuKeyDown}
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
