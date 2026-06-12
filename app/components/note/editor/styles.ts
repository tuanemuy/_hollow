/**
 * Repeated utility strings for the note editor (P12).
 *
 * Hoisted module-scoped literals so Tailwind's JIT can scan them; behaviour
 * is identical to inline `className` strings (see CLAUDE.md styling rules).
 */

import { scrollbarHidden } from "@/components/common/styles";

/**
 * P12 document-style title input: borderless, large, transparent. Focus
 * visualisation is intentionally left to the global `:focus-visible`
 * (`--shadow-focus`) — focus framing / spacing is out of scope here (#522).
 */
export const titleInput =
  "w-full bg-transparent border-0 outline-none py-1 mb-5 text-3xl font-regular tracking-tightest leading-tight text-ink placeholder:text-ink-tertiary";

/**
 * P12 editor topbar: mode tabs + autosave status + primary actions in one
 * wrapping row. Mirrors the mock `.editor-topbar` order
 * (`mode-tabs → save-status → editor-actions`).
 *
 * Below `sm` the mock stacks the row vertically (`.editor-topbar`
 * `flex-direction: column`) so the (horizontally-scrolling) mode tabs, the
 * autosave status and the save/cancel actions never compete for the narrow
 * width. At `sm` and up the original wrapping single row is kept.
 */
export const editorTopbar =
  "mb-4 flex items-center gap-3 flex-wrap max-sm:flex-col max-sm:items-stretch";

/**
 * P12 editor mode-switch tab rail (mock `.mode-tabs`). Below `sm` the pill
 * tabs become a single horizontally-scrolling row (`flex-nowrap` +
 * `overflow-x-auto`, scrollbar hidden) so 3 tabs never wrap or push the page
 * wider than the viewport (overflow=0). `min-w-0` lets the rail shrink inside
 * the topbar column so the scroll is isolated; `[&>*]:shrink-0` keeps each
 * pill at its intrinsic width. At `sm` and up it keeps the original wrapping
 * inline cluster.
 */
export const editorModeTabs = `inline-flex flex-wrap gap-1 min-w-0 max-sm:flex max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5 max-sm:[&>*]:shrink-0 ${scrollbarHidden}`;

/**
 * P12 WYSIWYG format toolbar (mock `.toolbar`): a sticky pill that follows
 * the scroll just below the app header (`top: header-height + space-2`,
 * `z-20`), shrink-to-fit (`inline-flex` + `self-start`) with wrapping
 * allowed when the buttons exceed the column width. Below `sm` it becomes a
 * full-width horizontally-scrolling rail (`self-stretch` + `flex-nowrap` +
 * `overflow-x-auto`, scrollbar hidden) so the icon buttons never push page
 * width — `overflow` on the sticky element itself does not break stickiness.
 * `[&>*]:shrink-0` keeps each button at its intrinsic square.
 */
export const editorToolbar = `sticky top-[calc(var(--header-height)+var(--space-2))] z-20 mb-4 inline-flex flex-wrap items-center gap-[2px] self-start rounded-pill border border-hairline bg-bg p-1 shadow-xs min-w-0 max-sm:self-stretch max-sm:flex max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[&>*]:shrink-0 ${scrollbarHidden}`;

/**
 * P12 FrontMatter key/value row (mock structured `.meta-field` rows). At `sm`
 * and up the key input, value input and delete button sit on one wrapping
 * line; below `sm` they stack into a single column (`flex-col`) so the
 * 1-column mobile layout matches the mock and the inputs get full width.
 */
export const frontMatterRow =
  "flex flex-wrap items-start gap-2 mb-3 max-sm:flex-col max-sm:items-stretch";

/**
 * P12 editor actions group (save / cancel). `ml-auto` pushes only this group
 * to the right edge — matching the mock's `.editor-actions { margin-left: auto }`
 * — so save-status stays left, just after the mode tabs.
 */
export const editorActions = "ml-auto inline-flex items-center gap-2";
