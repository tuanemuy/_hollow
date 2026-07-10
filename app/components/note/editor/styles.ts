/**
 * Repeated utility strings for the note editor (P12).
 *
 * Hoisted module-scoped literals so Tailwind's JIT can scan them; behaviour
 * is identical to inline `className` strings (see CLAUDE.md styling rules).
 */

import { scrollbarHidden, TOUCH_TARGET } from "@/components/common/styles";

/**
 * P12 document-style title input: borderless, large, transparent. Uses the
 * heading font and the mock's tight 1.12 line-height (`.title-input`). As a
 * "writing surface" it is caret-only: the global `:focus-visible`
 * box ring is cancelled with `focus-visible:shadow-none` and focus is shown by
 * the accent caret (`caret-accent`), consistent with the editor body.
 */
export const titleInput =
  "w-full bg-transparent border-0 outline-none py-1 mb-5 text-3xl font-heading font-regular tracking-tightest leading-[1.12] text-ink caret-accent placeholder:text-ink-tertiary focus-visible:shadow-none";

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
 * P12 WYSIWYG toolbar OUTER wrapper (Issue #825, mock `.toolbar` outer row):
 * the sticky row that follows the scroll just below the app header
 * (`top: header-height + space-2`, `z-20`) and carries `role="toolbar"`. Holds
 * the scrollable button rail (`editorToolbarRail`) plus the mobile-only
 * overflow (`⋯`) `<Menu>` as siblings.
 *
 * The sticky follow / `z-20` / `mb-4` live HERE, not on the rail (Issue #825
 * ADR-001): the overflow `<Menu>` renders its panel as an inline `absolute`
 * element (not a Portal), so it must sit OUTSIDE the rail — the rail is
 * `overflow-x-auto`, which CSS promotes to a two-axis clip container that would
 * otherwise clip the panel. Keeping the sticky on this non-clipping wrapper
 * preserves the documented header-following behaviour while the rail is demoted
 * to a plain (non-sticky) inner scroller.
 *
 * Desktop: shrink-to-fit + left-aligned (`self-start`), never grows — so the
 * pill stays 1px-identical to the pre-#825 layout (AC-2). Below `sm` it is
 * full-width (`max-sm:self-stretch`) so `⋯` pins to the row end.
 */
export const editorToolbarWrap =
  "sticky top-[calc(var(--header-height)+var(--space-2))] z-20 mb-4 flex items-center gap-[2px] self-start max-sm:self-stretch";

/**
 * P12 WYSIWYG toolbar RAIL (Issue #825, mock `.toolbar` pill): the pill holding
 * the format buttons. Desktop: shrink-to-fit (`inline-flex` + default flex
 * `0 1 auto`), left-aligned, wrapping allowed — 1px-identical to the pre-#825
 * `.toolbar`. Below `sm` it becomes a full-width (`max-sm:flex-1 min-w-0`)
 * horizontally-scrolling rail (`flex-nowrap` + `overflow-x-auto`, scrollbar
 * hidden) so the primary buttons never push page width and `⋯` (a sibling in
 * `editorToolbarWrap`) stays pinned to the row end. `[&>*]:shrink-0` keeps each
 * button at its intrinsic square.
 *
 * `flex-1` is deliberately `max-sm:`-scoped: an unscoped `flex-1` would make the
 * pill grow to full width inside the desktop wrapper and break AC-2's "desktop
 * shrink-to-fit left-aligned pill, 1px unchanged" guarantee.
 */
export const editorToolbarRail = `inline-flex flex-wrap items-center gap-[2px] rounded-pill border border-hairline bg-bg p-1 shadow-xs min-w-0 max-sm:flex-1 max-sm:flex max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[&>*]:shrink-0 ${scrollbarHidden}`;

/**
 * P12 FrontMatter key/value row (mock structured `.fm-row` rows). At `sm`
 * and up the key input, value input and delete button sit on one wrapping
 * line; below `sm` they stack into a single column (`flex-col`) so the
 * 1-column mobile layout matches the mock and the inputs get full width.
 */
export const frontMatterRow =
  "flex flex-wrap items-start gap-2 mb-3 max-sm:flex-col max-sm:items-stretch";

/**
 * P12 editor actions group (save / cancel).
 *
 * At `sm` and up this stays inside the topbar: `ml-auto` pushes only this
 * group to the right edge — matching the mock's `.editor-actions
 * { margin-left: auto }` — so save-status stays left, just after the mode
 * tabs.
 *
 * Below `sm` it detaches into the mock's bottom-fixed save CTA bar
 * (`.save-bar`) so the primary actions stay reachable while the
 * body scrolls (single DOM, no double render — ADR-003). The backdrop uses
 * the always-on `--header-bg` base + `supports-[backdrop-filter]:` blur
 * (ADR-005), mirrors `BulkActionBar` / `APP_HEADER`, and carries the
 * safe-area bottom inset. `[&>button]:flex-1` makes save/cancel equal-width
 * (the mock's save-status is intentionally not duplicated here — see the
 * mock `.save-bar` note; AutosaveIndicator stays single in the topbar to
 * avoid a second `aria-live`). `z-40` sits below the drawer scrim (z-90).
 */
export const editorActions =
  "ml-auto inline-flex items-center gap-2 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:ml-0 max-sm:gap-3 max-sm:rounded-t-lg max-sm:border-t max-sm:border-hairline max-sm:bg-[var(--header-bg)] max-sm:px-4 max-sm:py-3 max-sm:pb-[calc(var(--space-3)+env(safe-area-inset-bottom))] supports-[backdrop-filter]:max-sm:[backdrop-filter:var(--header-blur)] supports-[backdrop-filter]:max-sm:[-webkit-backdrop-filter:var(--header-blur)] max-sm:[&>button]:flex-1";

/**
 * P12 meta disclosure (mock `.meta-disclosure`): below `sm` the
 * directory row + tags collapse into a bordered surface sheet; the summary
 * button toggles the body. At `sm` and up this is a bare wrapper (no frame)
 * so the fields keep their current always-inline desktop layout.
 *
 * NOTE (ADR-004): the open/close `data-open` lives on the BODY (`metaBody`)
 * itself, NOT this container. Tailwind's `data-[open]:` compiles to a
 * self-attribute selector, so the element consuming the variant must carry
 * the attribute (the project avoids `group-data-*`; `APP_SIDEBAR` follows
 * the same rule). This container is open-state independent.
 */
export const metaDisclosure =
  "max-sm:mb-4 max-sm:overflow-hidden max-sm:rounded-lg max-sm:border max-sm:border-hairline max-sm:bg-surface-elevated";

/**
 * P12 meta disclosure summary (mock `.meta-summary`): mobile-only
 * toggle row (`sm:hidden`) with a leading folder icon, the preview text and
 * a caret. `TOUCH_TARGET` floors it to the 44px tap target.
 */
export const metaSummary = `flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-ink-secondary sm:hidden ${TOUCH_TARGET}`;

/**
 * P12 meta preview text (mock `.meta-preview`): the single-line
 * directory-path + tags summary shown in the folded state; truncates.
 */
export const metaSummaryPreview = "min-w-0 flex-1 truncate text-ink";

/**
 * P12 meta disclosure body (mock `.meta-body`): holds the directory
 * row + tags. Below `sm` it is hidden until open (`data-[open]:max-sm:block`)
 * with a top divider + inner padding; at `sm` and up it is always `block` so
 * the desktop always-inline layout is unchanged.
 *
 * NOTE (ADR-004): `data-open` is placed on THIS element (the one consuming
 * `data-[open]:`), not the container — see `metaDisclosure`.
 */
export const metaBody =
  "max-sm:hidden data-[open]:max-sm:block sm:block max-sm:border-t max-sm:border-hairline max-sm:px-3 max-sm:pt-3";

/**
 * P12 directory-row pill input (mock `.dir-pill`): compact 30px pill on the
 * surface background that lights up (`bg-bg` + accent border) on focus. Used
 * by the editor `DirectoryPicker` row variant's new-directory-name input;
 * reuse this when pill-ifying the tags row or the directory trigger.
 */
export const dirRowPillInput =
  "h-[30px] w-full rounded-pill border border-transparent bg-surface px-3 text-[13px] text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary focus:border-accent focus:bg-bg disabled:cursor-not-allowed disabled:opacity-disabled";

/**
 * P12 tags row (mock `.tags-row`): the chips + trailing input now live in a
 * single bordered container so they read as one field. `relative` anchors
 * the absolutely-positioned suggestion panel (ADR-004); `focus-within`
 * lights the accent border + focus ring (`--shadow-focus`) when the input
 * is focused (the input itself cancels its own global ring — see
 * `tagInputControl`). Bottom gap lives on the wrapping field, not here.
 */
export const tagsRow =
  "relative flex flex-wrap items-center gap-1.5 rounded-lg border border-hairline bg-bg px-2 py-1.5 transition-colors motion-reduce:transition-none focus-within:border-accent focus-within:shadow-focus";

/**
 * Wrapper around the tags row + inline error, carrying the mock's bottom
 * gap (`mb-5`) so the error sits inside the field's rhythm.
 */
export const tagsField = "mb-5";

/**
 * P12 tag chip (mock `.tag-chip`): 26px pill on the surface background with
 * the accent-ink label text. Hover lifts to `surface-hover`.
 */
export const tagChip =
  "inline-flex h-[26px] items-center gap-1.5 rounded-pill bg-surface px-2.5 text-[12.5px] text-accent-ink transition-colors motion-reduce:transition-none hover:bg-surface-hover";

/**
 * P12 tag chip remove button (mock `.tag-chip .x`): muted `×` that
 * the chip's `aria-label` describes per-tag. The `inline-flex … w-4 h-4`
 * box unifies the hit-area DIMENSIONS with the other chip removers
 * (`filterChipRemove`), but the box is intentionally NOT imported from there:
 * that variant is white-on-dark-chip only, whereas the tag chip is a light
 * surface pill, so the colour stays in-context (`ink-tertiary` → `ink`) and
 * no background box is drawn (the chip itself owns the hover). No 44px tap
 * floor here on purpose — flooring the `×` would bloat the chip (arch S-005).
 */
export const tagChipRemove =
  "inline-flex h-4 w-4 items-center justify-center leading-none text-[13px] text-ink-tertiary outline-none hover:text-ink focus-visible:text-ink disabled:cursor-not-allowed disabled:opacity-disabled";

/**
 * P12 trailing tag input (mock `.tag-input`): borderless, transparent, grows
 * to fill the row remainder while keeping a 140px minimum so it never
 * collapses behind the chips. The focus ring is owned by the container's
 * `focus-within` (see `tagsRow`), so the input cancels its own global
 * `:focus-visible` box ring (`focus-visible:shadow-none`) to avoid a
 * double ring — `outline-none` alone does not clear the box-shadow. Focus
 * is still hinted by the accent caret (`caret-accent`).
 */
export const tagInputControl =
  "min-w-[140px] flex-1 border-0 bg-transparent px-1.5 py-1 text-[13px] text-ink caret-accent outline-none placeholder:text-ink-tertiary focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-disabled";

/**
 * P12 tag suggestion panel: absolutely-positioned listbox anchored under
 * the tags row (ADR-004, mirrors `dirDropdownPanel`). Spans the field width
 * so candidates line up with the input; `max-sm` keeps it edge-to-edge.
 */
export const tagSuggestPanel =
  "absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-lg border border-hairline bg-bg p-2 shadow-md";

/**
 * P12 tag suggestion option (existing tag): `data-active` reflects the
 * `aria-activedescendant` highlight (mirrors `dirTreeItem`).
 */
export const tagSuggestOption =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-ink outline-none transition-colors motion-reduce:transition-none hover:bg-surface data-[active]:bg-surface";

/**
 * P12 "create new tag" indicator row: accent-coloured, non-interactive
 * display only (not a `role="option"`; the new tag is committed via Enter
 * on the unselected draft). Leading `＋`/`#` glyph marks it as a creation.
 */
export const tagSuggestOptionNew =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-accent";

/**
 * P12 inline tag validation message (AC-6): error-coloured note shown under
 * the field while a non-empty draft is invalid.
 */
export const tagInputError = "mt-1.5 px-0.5 text-[12px] text-error";

/**
 * P12 directory trigger pill (mock `.dir-pill`): 30px surface pill carrying
 * the folder icon, current selection label and a caret. Hover lifts to
 * `surface-hover`.
 */
export const dirPillTrigger =
  "inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-pill bg-surface px-3 text-[13px] text-ink outline-none transition-colors motion-reduce:transition-none hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-disabled";

/**
 * P12 directory dropdown panel (mock `.dir-dropdown`): 280px elevated card
 * anchored under the trigger; below `sm` it spans the row full-width.
 */
export const dirDropdownPanel =
  "absolute left-0 top-[calc(100%+6px)] z-30 w-[280px] rounded-lg border border-hairline bg-bg p-2 shadow-md max-sm:left-0 max-sm:right-0 max-sm:w-auto";

/**
 * P12 directory dropdown search field (mock `.dir-dropdown-search`): 30px
 * surface input on the soft-radius background.
 */
export const dirDropdownSearch =
  "mb-1.5 h-10 max-sm:min-h-[44px] w-full rounded-sm border-0 bg-surface px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-tertiary";

/**
 * P12 directory tree option row (mock `.dir-tree-item`): caret + folder icon
 * + name. `data-selected` paints the accent surface (mock `.selected`);
 * `data-active` reflects the `aria-activedescendant` highlight.
 */
export const dirTreeItem =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 max-sm:min-h-[44px] text-left text-[13px] text-ink outline-none transition-colors motion-reduce:transition-none hover:bg-surface data-[active]:bg-surface data-[selected]:bg-accent-surface data-[selected]:text-accent-ink";

/**
 * P12 "create new directory" option (mock `.dir-tree-item` accent variant):
 * accent-coloured row with a leading plus glyph.
 */
export const dirTreeItemNew =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 max-sm:min-h-[44px] text-left text-[13px] text-accent outline-none transition-colors motion-reduce:transition-none hover:bg-surface data-[active]:bg-surface";
