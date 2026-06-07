/**
 * Shared Tailwind utility-class constants for tag components.
 *
 * Follows the same plain-string-constant pattern as
 * `common/styles.ts`, `auth/styles.ts`, `layout/styles.ts`, `public/styles.ts`
 * (see CLAUDE.md "Repeated utility strings can be hoisted").
 */

/** Indeterminate progress bar track — 同期処理中の不確定進捗用。 */
export const progressTrack =
  "relative h-1 w-full overflow-hidden rounded-pill bg-surface mt-3";

/** Indeterminate progress bar — animate-pulse でゆるく「動いている」を表現。 */
export const progressBarIndeterminate =
  "absolute inset-0 rounded-pill bg-accent/60 motion-safe:animate-pulse";

/**
 * Tag list row — the per-tag `<li>`. Mirrors `layout/styles.ts` DATA_ROW but
 * adds `group` so the row's `hover` / `focus-within` can reveal the otherwise
 * hidden action column (mock `.list-row` + `.list-row-actions-hover`). The
 * `hover:bg-surface` matches mock `.list-row:hover`; the editing block overlays
 * its own `accent-surface` via `[grid-column:1/-1]`, so the two never conflict.
 */
export const TAG_ROW =
  "group grid grid-cols-[1fr_auto] gap-4 px-3 py-4 border-t border-hairline items-center last-of-type:border-b transition-colors motion-reduce:transition-none hover:bg-surface";

/**
 * Hover/focus-revealed inline action column (mock `.list-row-actions-hover`).
 * Transparent until the row is hovered or holds focus; hidden entirely below
 * `lg`, where the kebab menu (`TAG_ROW_KEBAB_WRAP`) takes over (mock
 * `@media (max-width: 1023px)` — see `.issue/542/adr.md` ADR-003).
 */
export const TAG_ROW_ACTIONS =
  "inline-flex items-center gap-2 max-lg:hidden opacity-0 transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100";

/** Kebab menu column — hidden at `lg`+, shown below `lg` (inverse of TAG_ROW_ACTIONS). */
export const TAG_ROW_KEBAB_WRAP = "hidden max-lg:inline-flex";

/** Tag note-count line — hidden below `lg` (mock `.tag-count { display: none }`). */
export const TAG_COUNT = "text-sm text-ink-tertiary max-lg:hidden";

/**
 * Tag last-used line (Issue #569, mock `.tag-lastused`) — same visual as
 * `TAG_COUNT` (`text-sm` / `ink-tertiary` / tabular-nums) with a 2px top
 * gap, and folded away below `lg` exactly like the count.
 */
export const TAG_LASTUSED =
  "text-sm text-ink-tertiary [font-variant-numeric:tabular-nums] mt-0.5 max-lg:hidden";

/**
 * Tag toolbar (Issue #569, mock `.tag-toolbar`) — page-scoped search on the
 * left, sort controls on the right. Wraps and stacks vertically below `sm`.
 */
export const TAG_TOOLBAR =
  "flex items-center justify-between gap-4 mb-5 flex-wrap max-sm:flex-col max-sm:items-stretch max-sm:gap-3";

/**
 * Search box wrapper (mock `.tag-toolbar .search`) — shares the header
 * `.search` visual tokens but left-aligned and width-capped for the toolbar.
 * The inner `<form>` carries `relative` to anchor the leading search icon.
 */
export const TAG_SEARCH = "max-w-[320px] flex-1 basis-60 max-sm:max-w-none";

/** Search input (mock header `.search input`) — surface pill with focus shadow. */
export const TAG_SEARCH_INPUT =
  "w-full h-9 pl-[38px] pr-4 rounded-pill bg-surface text-sm text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary hover:bg-surface-hover focus:bg-surface-hover focus:shadow-focus";

/** Leading search icon (mock `.search-icon`) — centered, non-interactive. */
export const TAG_SEARCH_ICON =
  "absolute left-[13px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none";

/** Sort cluster (mock `.tag-sort`) — label + segmented axis + direction toggle. */
export const TAG_SORT =
  "flex items-center gap-2 flex-wrap max-sm:justify-between";

/** "並び替え" label (mock `.tag-sort-label`). */
export const TAG_SORT_LABEL = "text-sm text-ink-tertiary";

/** Segmented control container (mock `.segmented`). */
export const SEGMENTED = "inline-flex p-0.5 rounded-md bg-surface";

/**
 * Segmented item (mock `.segmented-item`) — active state via `data-active`.
 * The selected item gets the `bg` surface + ink color + subtle shadow.
 */
export const SEGMENTED_ITEM =
  "px-3.5 py-1.5 rounded-sm text-sm font-medium text-ink-secondary bg-transparent transition-colors motion-reduce:transition-none hover:not-data-[active]:text-ink data-[active]:bg-bg data-[active]:text-ink data-[active]:shadow-xs max-sm:min-h-[44px]";

/** Direction toggle (mock `.tag-sort .icon-btn-sm`) — 32px ghost icon button. */
export const TAG_SORT_DIR =
  "inline-flex items-center justify-center w-8 h-8 rounded-full text-ink bg-transparent transition-colors motion-reduce:transition-none hover:bg-surface active:bg-surface-hover max-sm:min-w-[44px] max-sm:min-h-[44px]";

/**
 * Inline-rename editing block wrapper (mock `.tag-editing-block`). Paints the
 * accent-surface background on the whole editing area so the row beneath stays
 * borderless/transparent. Kept inside `TagActions` (TagActions-completed
 * wrapper) so the editing state never has to be lifted into `TagList` and thus
 * does not interfere with its `useOptimistic` projection — see ADR-004.
 */
export const TAG_EDITING_BLOCK =
  "-mx-3 -my-4 px-3 py-4 bg-accent-surface flex flex-col gap-1.5";

/**
 * 2-column layout inside the editing block (mock `.tag-editing-block .list-row`
 * `grid-template-columns: 1fr auto`): left column stacks heading + input, the
 * right column holds save/cancel aligned to the input's baseline (`items-end`).
 */
export const TAG_EDITING_GRID = "grid grid-cols-[1fr_auto] gap-4 items-end";

/** Left column of the editing grid — heading stacked above the rename input. */
export const TAG_EDITING_FIELD = "flex flex-col gap-1.5 min-w-0";

/** Context heading above the rename input (mock `.tag-editing-block .tag-count`). */
export const TAG_EDITING_HEADING = "text-sm text-ink-tertiary";

/** Inline rename input (mock `.rename-input` at the h-7 density). */
export const TAG_RENAME_INPUT =
  "h-7 px-2.5 bg-bg border border-hairline rounded-md text-sm text-ink outline-none transition-colors motion-reduce:transition-none min-w-[140px] hover:border-hairline-strong focus:border-accent";
