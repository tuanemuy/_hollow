"use client";

import { Copy, History, MoreHorizontal, Trash2 } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnIcon } from "@/components/common/styles";

/**
 * Overflow ("⋯") menu for the lower-frequency note actions — 複製 / 履歴 / 削除.
 *
 * Splits the `NoteActions` toolbar into frequently-used actions (kept visible)
 * and these secondary / destructive ones (folded behind the trigger) so the
 * toolbar reads as a clear hierarchy rather than a flat row (#459 ADR-001).
 *
 * Implements the same WAI-ARIA Menu pattern as `directory/DirectoryActionsMenu`
 * and `layout/UserMenu` (roving tabindex, document-level dismiss, focus
 * restoration; #289 ADR-003). Kept inline because this is the sole consumer; a
 * general Popover primitive remains a follow-up.
 */
export type NoteActionsMenuProps = Readonly<{
  onDuplicate: () => void;
  onHistory: () => void;
  onDelete: () => void;
  disabled?: boolean;
}>;

const MENU_TRIGGER = `${pillBtn} ${pillBtnIcon} data-[open]:bg-surface-hover`;
const MENU_PANEL =
  "absolute right-0 mt-1 z-40 min-w-[180px] rounded-md border border-hairline bg-bg shadow-sm py-1";
// Disabled items use `aria-disabled` (not the `disabled` attribute) so they
// stay focusable and keep their place in the roving-tabindex cycle. Hover is
// guarded with `not-aria-disabled:` mirroring the `pillBtn` convention;
// `focus:bg-surface` is left ungated since roving focus may legitimately land
// on a disabled item.
const MENU_ITEM =
  "flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-ink outline-none hover:not-aria-disabled:bg-surface focus:bg-surface aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed data-[danger]:text-error data-[danger]:hover:not-aria-disabled:bg-error-surface";
const MENU_SEPARATOR = "my-1 h-0 border-0 border-t border-hairline";

export function NoteActionsMenu({
  onDuplicate,
  onHistory,
  onDelete,
  disabled,
}: NoteActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const items: ReadonlyArray<{
    label: string;
    icon: typeof Copy;
    onSelect: () => void;
    danger?: boolean;
    separatorBefore?: boolean;
    disabled?: boolean | undefined;
  }> = [
    { label: "複製", icon: Copy, onSelect: onDuplicate, disabled },
    { label: "履歴", icon: History, onSelect: onHistory },
    {
      label: "削除",
      icon: Trash2,
      onSelect: onDelete,
      danger: true,
      separatorBefore: true,
      disabled,
    },
  ];

  // Roving tabindex (WAI-ARIA Menu pattern, #289 ADR-006): exactly one
  // menuitem carries `tabIndex=0` + DOM focus, the rest `tabIndex=-1`.
  useEffect(() => {
    if (!open) return;
    const menuitems =
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    menuitems?.[activeIndex]?.focus();
  }, [open, activeIndex]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = items.length;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (activeIndex + 1) % count;
    else if (event.key === "ArrowUp") next = (activeIndex - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
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
    // Move focus back to the trigger BEFORE closing, so when `fn()` mounts a
    // Dialog (削除 → ConfirmDialog) the Dialog's `previousActiveRef` captures
    // the trigger rather than `<body>` (the menuitem is about to unmount).
    // Mirrors DirectoryActionsMenu's focus-restoration handling.
    triggerRef.current?.focus();
    setOpen(false);
    fn();
  };

  const onFocusOut = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!open) return;
    const next = event.relatedTarget;
    if (next instanceof Node && containerRef.current?.contains(next)) return;
    setOpen(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper hosts a button + menu panel and only listens for blur bubbling out of those interactive children; semantics live on the trigger button and `role="menu"`.
    <div ref={containerRef} className="relative" onBlur={onFocusOut}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="その他の操作"
        title="その他の操作"
        data-icon=""
        data-open={open || undefined}
        className={MENU_TRIGGER}
        onClick={() => {
          if (!open) setActiveIndex(0);
          setOpen((prev) => !prev);
        }}
      >
        <Icon icon={MoreHorizontal} size={20} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className={MENU_PANEL}
          onKeyDown={onMenuKeyDown}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          {items.map((item, index) => (
            <Fragment key={item.label}>
              {item.separatorBefore ? <hr className={MENU_SEPARATOR} /> : null}
              <button
                type="button"
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                data-danger={item.danger || undefined}
                aria-disabled={item.disabled || undefined}
                className={MENU_ITEM}
                onClick={item.disabled ? undefined : runAndClose(item.onSelect)}
              >
                <Icon icon={item.icon} />
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
