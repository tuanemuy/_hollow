/**
 * Tailwind utility-class constants specific to the directory tree UI in
 * the sidebar. Kept domain-local (not in `components/common/styles.ts`)
 * because the tree-item visual language is unique to this surface.
 *
 * Following Issue #70 ADR-002: plain string constants — JIT still sees
 * the static utility tokens, identical bundle to inline strings.
 */

/** Wrapper row for a single treeitem (link + actions trigger). */
export const TREE_ITEM_ROW =
  "group flex items-center gap-1 pr-1 rounded-md hover:bg-surface";

/**
 * The directory name link inside a treeitem.
 *
 * Active state styles are on the Link itself because TanStack Router's
 * `activeProps` attaches `data-active` / `aria-current` to the Link, not
 * to ancestors; placing the modifiers here lets the styles actually take
 * effect (and matches the legacy `NAV_ITEM` shape used by the old
 * read-only Sidebar tree).
 */
export const TREE_ITEM_LINK =
  "flex-1 min-w-0 flex items-center gap-2 px-3 py-[7px] rounded-md text-sm text-ink cursor-pointer transition-colors motion-reduce:transition-none select-none no-underline truncate data-[active]:bg-surface data-[active]:font-medium aria-[current=page]:bg-surface aria-[current=page]:font-medium";

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
