"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ACTIONS_MENU_ITEM,
  ACTIONS_MENU_PANEL,
  TREE_ACTION_BUTTON,
} from "./styles";

export type DirectoryActionsMenuProps = Readonly<{
  triggerLabel: string;
  onCreateChild: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}>;

/**
 * Small inline popover that exposes the four directory operations
 * (create-child / rename / move / delete) for a single treeitem.
 *
 * ADR-003: primitive-less by design — the popover is implemented inline
 * because this Issue uses it in a single place. Position is fixed at
 * `absolute right-0 mt-1`; viewport-edge flip is intentionally not
 * implemented for v1 (sidebar is 240px wide, vertical scroll absorbs
 * overflow). A general-purpose Popover primitive is a follow-up.
 */
export function DirectoryActionsMenu({
  triggerLabel,
  onCreateChild,
  onRename,
  onMove,
  onDelete,
}: DirectoryActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const items: ReadonlyArray<{
    label: string;
    onSelect: () => void;
    danger?: boolean;
  }> = [
    { label: "子ディレクトリを作成", onSelect: onCreateChild },
    { label: "リネーム", onSelect: onRename },
    { label: "移動", onSelect: onMove },
    { label: "削除", onSelect: onDelete, danger: true },
  ];

  // Roving tabindex (WAI-ARIA Menu pattern, Issue #289 / ADR-006): exactly
  // one menuitem carries `tabIndex=0` and DOM focus, the rest `tabIndex=-1`.
  // Arrow / Home / End move `activeIndex`; this effect mirrors that into real
  // focus whenever the menu is open. On open `activeIndex` is reset to 0 by
  // the trigger handler so focus lands on the first item.
  useEffect(() => {
    if (!open) return;
    const menuitems =
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    menuitems?.[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Arrow / Home / End navigation within the open menu. preventDefault stops
  // the arrow keys from scrolling the page; stopPropagation stops them from
  // also reaching the enclosing treeitem's onKeyDown (DirectoryTree handles
  // ArrowUp/Down for sibling navigation, which would double-fire otherwise).
  // Escape is intentionally left to bubble to the document-level handler below.
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = items.length;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (activeIndex + 1) % count;
    else if (event.key === "ArrowUp") next = (activeIndex - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex(next);
  };

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
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runAndClose = (fn: () => void) => () => {
    // Move focus back to the trigger BEFORE closing the menu, so that when
    // `fn()` mounts a Dialog, the Dialog's `previousActiveRef` captures the
    // trigger button rather than `<body>` (the menuitem is about to be
    // unmounted by `setOpen(false)`). This preserves focus restoration when
    // the Dialog later closes.
    triggerRef.current?.focus();
    setOpen(false);
    fn();
  };

  // Close on focus leaving the menu (Tab away). Without this the menu can
  // stay visually expanded while focus is somewhere else in the page,
  // which conflicts with the `role=menu` semantic and pollutes the SR
  // announcement state.
  const onFocusOut = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!open) return;
    const next = event.relatedTarget;
    if (next instanceof Node && containerRef.current?.contains(next)) return;
    setOpen(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper hosts a button + menu panel and only listens for blur bubbling out of those interactive children; it deliberately has no role of its own (semantics are carried by `role="menu"` and the trigger button).
    <div ref={containerRef} className="relative" onBlur={onFocusOut}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        data-open={open || undefined}
        className={TREE_ACTION_BUTTON}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          // Reset roving focus to the first item only when opening.
          if (!open) setActiveIndex(0);
          setOpen((prev) => !prev);
        }}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open ? (
        // onMouseDown preventDefault keeps focus on the currently focused
        // menuitem during mouse interaction. On macOS Safari/Firefox a
        // `<button>` click moves focus to <body>, which would otherwise
        // trigger the container's onBlur → close → click on an unmounted
        // menuitem (and the click silently drops).
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className={ACTIONS_MENU_PANEL}
          onKeyDown={onMenuKeyDown}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              data-danger={item.danger || undefined}
              className={ACTIONS_MENU_ITEM}
              onClick={runAndClose(item.onSelect)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
