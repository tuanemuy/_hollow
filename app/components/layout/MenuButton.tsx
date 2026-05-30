"use client";

import { Menu } from "lucide-react";
import { Icon } from "@/components/common/Icon";
import { useDrawer } from "./AppShellDrawer";
import { MENU_BTN } from "./styles";

/**
 * Hamburger that toggles the off-canvas sidebar drawer (Issue #354).
 * Rendered inside the `Header` RSC payload as a client island so it can
 * read the drawer state from `AppShellDrawer`'s context while the header
 * itself stays a server component (ADR-002). Hidden at `lg` where the
 * sidebar is an in-flow column.
 */
export function MenuButton() {
  const { open, toggle } = useDrawer();
  return (
    <button
      type="button"
      className={MENU_BTN}
      aria-label="メニューを開く"
      aria-expanded={open}
      onClick={toggle}
    >
      <Icon icon={Menu} size={20} />
    </button>
  );
}
