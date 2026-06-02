/**
 * Tailwind utility-class constants specific to the directory tree UI in
 * the sidebar. Kept domain-local (not in `components/common/styles.ts`)
 * because the tree-item visual language is unique to this surface.
 *
 * Following Issue #70 ADR-002: plain string constants — JIT still sees
 * the static utility tokens, identical bundle to inline strings.
 */

import { navItem } from "../common/styles";

/**
 * Wrapper row for a single treeitem (link + actions trigger).
 *
 * The selection highlight is painted on this row (not the inner Link) so it
 * spans the full row box — caret column and action column included — matching
 * the hover highlight. The `a[...]` tag qualifier on the `:has()` variants
 * keeps the disclosure button's `data-open` from being mistaken for the
 * active state (only the active Link carries `data-active` / `aria-current`).
 */
export const TREE_ITEM_ROW =
  "group flex items-center gap-1 pr-1 rounded-md hover:bg-surface has-[a[data-active]]:bg-surface has-[a[aria-current=page]]:bg-surface";

/**
 * The directory name link inside a treeitem.
 *
 * Active text decoration (font-weight) stays on the Link because TanStack
 * Router's `activeProps` attaches `data-active` / `aria-current` here, not to
 * ancestors. The selection background lives on `TREE_ITEM_ROW` instead so the
 * highlight spans the whole row rather than just this `flex-1` link.
 */
export const TREE_ITEM_LINK = `${navItem} flex-1 min-w-0 truncate`;

/** Disclosure caret button (expand / collapse children). */
export const TREE_DISCLOSURE =
  "inline-flex items-center justify-center w-5 h-5 rounded text-ink-tertiary hover:text-ink hover:bg-surface-hover transition-colors motion-reduce:transition-none shrink-0";

/** The "︙" / "+" trigger buttons sitting at the row edge. */
export const TREE_ACTION_BUTTON =
  "inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-tertiary hover:text-ink hover:bg-surface-hover transition-colors motion-reduce:transition-none opacity-0 group-hover:opacity-100 focus:opacity-100 data-[open]:opacity-100 max-sm:opacity-100 max-sm:min-w-[44px] max-sm:min-h-[44px]";

/** The header-level "+" icon button (always visible, smaller). */
export const SECTION_ACTION_BUTTON =
  "inline-flex items-center justify-center w-6 h-6 rounded-md text-ink-tertiary hover:text-ink hover:bg-surface-hover transition-colors motion-reduce:transition-none max-sm:min-w-[44px] max-sm:min-h-[44px]";

/** Popover panel for the `︙` actions menu. */
export const ACTIONS_MENU_PANEL =
  "absolute right-0 mt-1 z-40 min-w-[160px] rounded-md border border-hairline bg-bg shadow-sm py-1";

/** Single menu item inside the actions popover. */
export const ACTIONS_MENU_ITEM =
  "flex items-center w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface focus:bg-surface outline-none disabled:opacity-55 disabled:cursor-not-allowed data-[danger]:text-error data-[danger]:hover:bg-error-surface";

/** Inline rename input rendered in place of the link. */
export const TREE_ITEM_RENAME_INPUT =
  "flex-1 min-w-0 px-3 py-[5px] rounded-md border border-accent bg-bg text-sm text-ink outline-none";

/** Inline error text shown under a treeitem after a failed action. */
export const TREE_ITEM_ERROR = "text-error text-[12px] px-3 py-1";

/** Section header that hosts the "+" button next to the title. */
export const SIDEBAR_SECTION_HEADER =
  "flex items-center justify-between px-3 mb-1.5";

/** Section title variant when paired with the "+" button (no padding). */
export const SIDEBAR_SECTION_TITLE_INLINE =
  "text-[11px] font-medium text-ink-tertiary uppercase tracking-[0.06em]";
