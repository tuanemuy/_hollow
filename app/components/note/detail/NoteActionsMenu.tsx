"use client";

import { Copy, History, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Menu, MenuItem } from "@/components/common/Menu";
import { pillBtn, pillBtnIcon } from "@/components/common/styles";

/**
 * Overflow ("⋯") menu for the lower-frequency note actions — 複製 / 履歴 / 削除.
 *
 * Splits the `NoteActions` toolbar into frequently-used actions (kept visible)
 * and these secondary / destructive ones (folded behind the trigger) so the
 * toolbar reads as a clear hierarchy rather than a flat row (#459 ADR-001).
 *
 * Built on the shared `<Menu>`/`<MenuItem>` WAI-ARIA Menu primitive (#467):
 * roving tabindex, document-level dismiss, focus restoration, and the
 * `runAndClose` Dialog-connection order all live in the primitive.
 */
export type NoteActionsMenuProps = Readonly<{
  onDuplicate: () => void;
  onHistory: () => void;
  onDelete: () => void;
  disabled?: boolean;
}>;

const MENU_TRIGGER = `${pillBtn} ${pillBtnIcon} data-[open]:bg-surface-hover`;

export function NoteActionsMenu({
  onDuplicate,
  onHistory,
  onDelete,
  disabled,
}: NoteActionsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      ariaLabel="その他の操作"
      panelClassName="absolute right-0 mt-1 z-40 min-w-[180px]"
      trigger={(triggerProps) => (
        <button
          {...triggerProps}
          type="button"
          aria-label="その他の操作"
          title="その他の操作"
          data-icon=""
          data-open={open || undefined}
          className={MENU_TRIGGER}
        >
          <Icon icon={MoreHorizontal} size={20} />
        </button>
      )}
    >
      <MenuItem onSelect={onDuplicate} disabled={disabled} icon={Copy}>
        複製
      </MenuItem>
      <MenuItem onSelect={onHistory} icon={History}>
        履歴
      </MenuItem>
      <MenuItem
        separatorBefore
        danger
        disabled={disabled}
        onSelect={onDelete}
        icon={Trash2}
      >
        削除
      </MenuItem>
    </Menu>
  );
}
