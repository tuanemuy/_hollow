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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

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
    setOpen(false);
    fn();
  };

  return (
    <div ref={containerRef} className="relative">
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
          setOpen((prev) => !prev);
        }}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open ? (
        <div id={menuId} role="menu" className={ACTIONS_MENU_PANEL}>
          <button
            type="button"
            role="menuitem"
            className={ACTIONS_MENU_ITEM}
            onClick={runAndClose(onCreateChild)}
          >
            子ディレクトリを作成
          </button>
          <button
            type="button"
            role="menuitem"
            className={ACTIONS_MENU_ITEM}
            onClick={runAndClose(onRename)}
          >
            リネーム
          </button>
          <button
            type="button"
            role="menuitem"
            className={ACTIONS_MENU_ITEM}
            onClick={runAndClose(onMove)}
          >
            移動
          </button>
          <button
            type="button"
            role="menuitem"
            data-danger=""
            className={ACTIONS_MENU_ITEM}
            onClick={runAndClose(onDelete)}
          >
            削除
          </button>
        </div>
      ) : null}
    </div>
  );
}
