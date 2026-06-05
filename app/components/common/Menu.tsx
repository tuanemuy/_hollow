"use client";

import type { LucideIcon } from "lucide-react";
import {
  Children,
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { Icon } from "./Icon";
import { menuItem, menuPanel, menuSeparator } from "./styles";
import { type PopupRole, usePopover } from "./usePopover";
import { useRovingMenu } from "./useRovingMenu";

/**
 * Declarative WAI-ARIA Menu primitive (Issue #467) — the sugar layer over
 * `usePopover`(menu) + `useRovingMenu` for the three overflow / avatar /
 * directory actions menus. The host owns open/close state inline.
 *
 * Index discipline (ADR-001 補足): `<Menu>` scans `Children.toArray(children)`
 * for `<MenuItem>` nodes and feeds each its array index by cloning it with the
 * index injected — the single source of truth for roving. Non-MenuItem
 * children (UserMenu's info header / logout error) are rendered verbatim but
 * excluded from the roving index. The `querySelectorAll('[role=menuitem]')`
 * inside `useRovingMenu` is the focus executor only; declared order equals DOM
 * order because only MenuItems carry `role="menuitem"`.
 *
 * `runAndClose` enforces the Dialog-connection order (focus trigger → close →
 * `onSelect()`) — the most important invariant: an `onSelect` that mounts a
 * Dialog must see the trigger as the previously-active element, not `<body>`.
 */
type MenuContextValue = Readonly<{
  getTabIndex: (index: number) => 0 | -1;
  runAndClose: (fn: () => void) => void;
}>;

const MenuContext = createContext<MenuContextValue | null>(null);

/**
 * Props handed to the `<Menu trigger>` render prop. Spread onto a `<button>`.
 * `onClick` carries the open toggle plus any `onTriggerClick` opt-in side
 * effect, hence it receives the mouse event (unlike the dialog-mode
 * `PopoverTriggerProps.onClick`).
 */
export type MenuTriggerProps = Readonly<{
  ref: React.Ref<HTMLButtonElement>;
  "aria-haspopup": PopupRole;
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}>;

export type MenuProps = Readonly<{
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Accessible name for the menu panel. */
  ariaLabel: string;
  /**
   * Render prop for the trigger button. Receives the wired props
   * (ref / aria-* / onClick toggle); spread them onto a `<button>`.
   */
  trigger: (props: MenuTriggerProps) => ReactNode;
  /** Panel chrome / position / width utilities (caller-owned). */
  panelClassName: string;
  /**
   * Opt-in trigger-click side effect run BEFORE the open toggle (Directory
   * needs `stopPropagation` + `preventDefault` to stop treeitem double-fire /
   * link navigation).
   */
  onTriggerClick?:
    | ((event: React.MouseEvent<HTMLButtonElement>) => void)
    | undefined;
  /**
   * Opt-in panel keydown side effect run BEFORE roving navigation (Directory
   * needs `stopPropagation` so Arrow keys do not also reach the enclosing
   * treeitem's handler, which would double-fire sibling navigation).
   */
  onPanelKeyDown?:
    | ((event: React.KeyboardEvent<HTMLDivElement>) => void)
    | undefined;
  children: ReactNode;
}>;

export function Menu({
  open,
  onOpenChange,
  ariaLabel,
  trigger,
  panelClassName,
  onTriggerClick,
  onPanelKeyDown,
  children,
}: MenuProps) {
  const popover = usePopover({ open, onOpenChange, haspopup: "menu" });

  // Single source of truth for roving index: assign each MenuItem its index in
  // declared order. Non-MenuItem children pass through unindexed (and are
  // excluded from the roving count).
  let itemCount = 0;
  const indexedChildren = Children.toArray(children).map((child) => {
    if (isValidElement(child) && child.type === MenuItem) {
      const indexed = cloneElement(
        child as ReactElement<MenuItemProps & InternalItemProps>,
        { _rovingIndex: itemCount },
      );
      itemCount += 1;
      return indexed;
    }
    return child;
  });

  const roving = useRovingMenu({
    open,
    itemCount,
    panelRef: popover.containerRef as React.RefObject<HTMLElement | null>,
  });

  const runAndClose = (fn: () => void) => {
    popover.closeAndRestoreFocus();
    fn();
  };

  const ctx: MenuContextValue = {
    getTabIndex: roving.getTabIndex,
    runAndClose,
  };

  const triggerProps = {
    ...popover.triggerProps,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      onTriggerClick?.(event);
      popover.triggerProps.onClick();
    },
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper hosts a button + menu panel and only listens for blur bubbling out of those interactive children; semantics live on the trigger button and `role="menu"`.
    <div
      ref={popover.containerRef}
      className="relative"
      onBlur={popover.onFocusOut}
    >
      {trigger(triggerProps)}
      {open ? (
        // onMouseDown preventDefault keeps focus on the active menuitem during
        // mouse interaction: on macOS Safari/Firefox a `<button>` click moves
        // focus to <body>, which would otherwise trigger the container's
        // onBlur → close → click on an unmounted menuitem (the click drops).
        <div
          id={popover.panelId}
          role="menu"
          aria-label={ariaLabel}
          className={`${menuPanel} ${panelClassName}`}
          onKeyDown={(event) => {
            onPanelKeyDown?.(event);
            roving.onKeyDown(event);
          }}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <MenuContext.Provider value={ctx}>
            {indexedChildren}
          </MenuContext.Provider>
        </div>
      ) : null}
    </div>
  );
}

// `_rovingIndex` is injected by `<Menu>` via cloneElement; consumers never
// pass it.
type InternalItemProps = Readonly<{ _rovingIndex?: number }>;

export type MenuItemProps = Readonly<{
  onSelect: () => void;
  disabled?: boolean | undefined;
  danger?: boolean | undefined;
  separatorBefore?: boolean | undefined;
  icon?: LucideIcon | undefined;
  children: ReactNode;
}>;

export function MenuItem({
  onSelect,
  disabled,
  danger,
  separatorBefore,
  icon,
  children,
  _rovingIndex = 0,
}: MenuItemProps & InternalItemProps) {
  const ctx = useContext(MenuContext);
  if (ctx === null) {
    throw new Error("MenuItem must be rendered inside a <Menu>.");
  }

  return (
    <Fragment>
      {separatorBefore ? <hr className={menuSeparator} /> : null}
      <button
        type="button"
        role="menuitem"
        tabIndex={ctx.getTabIndex(_rovingIndex)}
        data-danger={danger || undefined}
        aria-disabled={disabled || undefined}
        className={menuItem}
        onClick={disabled ? undefined : () => ctx.runAndClose(onSelect)}
      >
        {icon ? <Icon icon={icon} /> : null}
        {children}
      </button>
    </Fragment>
  );
}
