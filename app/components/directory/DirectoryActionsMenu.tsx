"use client";

import { useState } from "react";
import { Menu, MenuItem } from "@/components/common/Menu";
import { TREE_ACTION_BUTTON } from "./styles";

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
 * Built on the shared `<Menu>`/`<MenuItem>` WAI-ARIA Menu primitive (#467).
 * Position is fixed at `absolute right-0 mt-1`; viewport-edge flip is
 * intentionally not implemented (sidebar is 240px wide, vertical scroll
 * absorbs overflow; #289 ADR-003).
 *
 * Directory-specific: the trigger click and the menu Arrow-key keydown both
 * stop propagation so they do not double-fire the enclosing treeitem's
 * navigation / link handlers.
 */
export function DirectoryActionsMenu({
  triggerLabel,
  onCreateChild,
  onRename,
  onMove,
  onDelete,
}: DirectoryActionsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      ariaLabel={triggerLabel}
      panelClassName="absolute right-0 mt-1 z-40 min-w-[160px]"
      onTriggerClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onPanelKeyDown={(event) => {
        // Arrow / Home / End must not also reach the enclosing treeitem's
        // onKeyDown (DirectoryTree handles ArrowUp/Down for sibling
        // navigation, which would double-fire otherwise). Escape is left to
        // bubble to the document-level dismiss handler.
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Home" ||
          event.key === "End"
        ) {
          event.stopPropagation();
        }
      }}
      trigger={(triggerProps) => (
        <button
          {...triggerProps}
          type="button"
          aria-label={triggerLabel}
          data-open={open || undefined}
          className={TREE_ACTION_BUTTON}
        >
          <span aria-hidden="true">⋮</span>
        </button>
      )}
    >
      <MenuItem onSelect={onCreateChild}>子ディレクトリを作成</MenuItem>
      <MenuItem onSelect={onRename}>リネーム</MenuItem>
      <MenuItem onSelect={onMove}>移動</MenuItem>
      <MenuItem danger onSelect={onDelete}>
        削除
      </MenuItem>
    </Menu>
  );
}
