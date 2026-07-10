// Shared utility class strings used across the authenticated app shell.

import { navItem, TOUCH_TARGET_SQUARE } from "../common/styles";

export const APP_HEADER =
  "sticky top-0 z-50 h-[var(--header-height)] grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-hairline bg-[var(--header-bg)] px-6 py-[14px] supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)] supports-[backdrop-filter]:[-webkit-backdrop-filter:var(--header-blur)]";

export const APP_HEADER_LEFT = "flex items-center gap-3";
export const APP_HEADER_RIGHT = "flex items-center gap-2";

// Header CTA collapse (#628 ADR-003): the upload / new-note buttons render as
// labeled 36px pills on desktop and collapse to a 36px icon-only circle below
// `sm` (label hidden via `max-sm:hidden` on the `<span>`). `h-9!` pins the
// header exception height to 36px (#628 ADR-004) so it aligns with the 36px
// search input / menu — the base `pillBtn` is `h-10` (40px, #633), and the `!`
// is required because a plain `h-9` shrink loses to `h-10` by generated-CSS
// source order (see `common/styles` `pillBtnSm` caveat). `max-sm:w-9 px-0
// justify-center` makes the mobile square; `max-sm:min-h-9!` cancels `pillBtn`'s
// `max-sm:min-h-[44px]` tap floor (same `!` reason).
export const HEADER_CTA_COLLAPSE =
  "h-9! max-sm:w-9 max-sm:px-0 max-sm:justify-center max-sm:min-h-9!";

// New-note CTA demotion (#628 ADR-003, 案2-B): on desktop it is a low-emphasis
// text button (transparent + secondary ink, surface on hover); below `sm` it
// reverts to the base `pillBtn` surface fill so the collapsed icon circle reads
// as a normal secondary button next to the accent upload. Expressed as `sm:`
// overrides over the base so mobile needs no override and desktop wins by
// variant source order (no `!` needed — `bg-transparent` is not a shrink). The
// hover override carries the same `not-disabled:not-aria-disabled:` guard as
// the base `pillBtn` hover (and as `pillBtnGhost`): without `not-aria-disabled:`
// it is only (0,3,0) and loses to the base hover (0,4,0) on specificity, so the
// hover background would wrongly stay `surface-hover` instead of `surface`.
export const HEADER_NEW_NOTE_DEMOTE =
  "sm:bg-transparent sm:text-ink-secondary sm:hover:not-disabled:not-aria-disabled:bg-surface sm:hover:not-disabled:not-aria-disabled:text-ink";

export const SEARCH_BOX_WRAPPER = "max-w-[460px] w-full mx-auto relative";

// Mobile P12 editor orientation label (Issue #824), mirroring the mock
// `.header-doc` (`spec/design/pages/mobile/P12-editor.html`): `text-sm` /
// `font-medium` / `text-ink` with `truncate` (overflow-hidden + ellipsis +
// nowrap). No `text-center` — the mock has no `text-align`, so it is
// left-aligned, which also plays nicely with the trailing ellipsis. `sm:hidden`
// keeps it mobile-only. `min-w-0` here lets the label ellipsize inside the
// central grid item; the item itself (`HeaderCenter` root) also needs `min-w-0`
// so the `minmax(auto,1fr)` track does not grow to the nowrap min-content and
// push the header wider (ADR-004 — both are required).
export const HEADER_DOC =
  "sm:hidden truncate text-sm font-medium text-ink min-w-0";

export const SEARCH_BOX_INPUT =
  "w-full h-9 border-0 bg-surface rounded-pill pl-[38px] pr-4 text-sm text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary hover:bg-surface-hover focus:bg-surface-hover";

export const SEARCH_BOX_ICON =
  "absolute left-[11px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none";

export const ICON_BTN = `w-9 h-9 rounded-pill bg-surface inline-flex items-center justify-center text-ink transition-colors motion-reduce:transition-none hover:bg-surface-hover ${TOUCH_TARGET_SQUARE}`;

export const AVATAR =
  "w-8 h-8 rounded-full bg-gradient-to-br from-[#c9d3df] to-[#8e99a8] text-white text-xs font-medium inline-flex items-center justify-center no-underline cursor-pointer";

// User menu. Relocated from the header to the sidebar foot (#628 ADR-003); the
// panel chrome / roving items come from the shared `<Menu>` primitive
// (`common/Menu`, #467). The identity now lives in the trigger row (see
// `SIDEBAR_USER_*`), so the panel header (`USER_MENU_INFO`) keeps only the role
// label to avoid duplicating name / email.
export const USER_MENU_INFO =
  "flex flex-col gap-0.5 px-3 py-2.5 border-b border-hairline";

export const USER_MENU_INFO_ROLE = "text-xs text-ink-tertiary";

// Sidebar foot user section (#628 ADR-003). `mt-auto` pushes it to the bottom
// of the `flex flex-col` sidebar; a hairline separates it from the nav.
export const SIDEBAR_USER = "mt-auto pt-3 border-t border-hairline";

// The trigger row: avatar + identity column + caret, full sidebar width. Opens
// the `<Menu>` panel upward (the panel uses `bottom-full` since the row sits at
// the screen foot).
export const SIDEBAR_USER_ROW =
  "flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-left transition-colors motion-reduce:transition-none hover:bg-surface";

export const SIDEBAR_USER_META = "flex flex-col min-w-0 flex-1";

export const SIDEBAR_USER_NAME = "text-sm font-medium text-ink truncate";

export const SIDEBAR_USER_EMAIL = "text-xs text-ink-tertiary truncate";

export const SIDEBAR_USER_CARET = "text-ink-tertiary shrink-0";

export const APP_LAYOUT =
  "grid grid-cols-1 min-h-[calc(100vh-var(--header-height))]";

export const APP_LAYOUT_WITH_SIDEBAR = `${APP_LAYOUT} lg:grid-cols-[var(--sidebar-width)_1fr]`;

// Below `lg` the sidebar is an off-canvas drawer (Issue #354): fixed, slid
// out by default, revealed via `data-open`. At `lg` and up it returns to the
// in-flow sticky column. New media queries are avoided in favour of
// `max-lg:` / `lg:` variants so the `--breakpoint-*` duplication does not
// need touching (see CLAUDE.md styling notes).
// `flex flex-col` lets the user section (`SIDEBAR_USER`) pin to the bottom via
// `mt-auto` (#628 ADR-003: the user menu moved out of the header into the
// sidebar foot). When the nav overflows, the user row scrolls to the end with
// the content rather than overlapping it.
export const APP_SIDEBAR =
  "flex flex-col px-4 pt-5 pb-8 overflow-y-auto bg-bg max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[280px] max-lg:max-w-[86vw] max-lg:z-[100] max-lg:-translate-x-full max-lg:shadow-md max-lg:transition-transform max-lg:motion-reduce:transition-none data-[open]:max-lg:translate-x-0 lg:sticky lg:top-[var(--header-height)] lg:h-[calc(100vh-var(--header-height))] lg:border-r lg:border-hairline";

// Scrim behind the mobile drawer; clicking it closes the drawer. Shown only
// below `lg` and only while open, regardless of generated-CSS source order.
export const SIDEBAR_BACKDROP =
  "fixed inset-0 z-[90] bg-black/20 hidden data-[open]:max-lg:block";

// Hamburger that toggles the drawer. Hidden once the sidebar is in-flow at
// `lg`. Sits in the global header's control row, so it follows the header
// exception (#628 ADR-004): 36px (`w-9 h-9`) with no mobile 44px tap floor,
// matching the search input / CTA heights rather than the app-wide floor.
export const MENU_BTN =
  "lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-md text-ink transition-colors motion-reduce:transition-none hover:bg-surface";

export const SIDEBAR_SECTION = "mb-7";

export const SIDEBAR_SECTION_TITLE =
  "text-[11px] font-medium text-ink-tertiary uppercase tracking-[0.06em] px-3 mb-1.5";

// Sidebar nav link = shared `navItem` base + sidebar-only surface highlight
// (the active background is painted on the link here, unlike the directory
// tree where it lives on the row).
export const NAV_ITEM = `${navItem} relative hover:bg-surface aria-[current=page]:bg-surface data-[active]:bg-surface`;

// Right-aligned count badge for sidebar nav items (mock `.nav-item .count`:
// `margin-left: auto; font-size: 12px; color: var(--color-ink-tertiary)`).
export const NAV_COUNT = "ml-auto text-xs text-ink-tertiary";

// Active-state props shared by the sidebar nav `<Link>`s and `UploadNavItem`:
// surface the active route to both screen readers (`aria-current="page"`) and
// styling (`data-active`). Hoisted here so `Sidebar` (server) and
// `UploadNavItem` (client) reference one definition.
export const ACTIVE_NAV_PROPS = {
  "data-active": "",
  "aria-current": "page" as const,
};

// `max-sm:px-4` (Issue #818 ADR-002): mobile horizontal padding drops from
// 24px to the mock's 16px across all `/_app` pages, easing narrow-viewport
// horizontal pressure. Desktop (`sm` and up) keeps `px-6`.
export const APP_MAIN =
  "px-6 max-sm:px-4 pt-8 pb-20 max-w-[var(--container-max)] mx-auto w-full min-w-0";

// Shared icon class for empty-state eyecatches (paired with `EMPTY_STATE`).
// `block` makes `mx-auto` work for the inline-by-default SVG.
export const EMPTY_STATE_ICON = "block mx-auto mb-3 text-ink-tertiary";

export const PAGE_TITLE =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-2.5 [overflow-wrap:anywhere] min-w-0";

export const PAGE_SUBTITLE = "text-[15px] text-ink-secondary mb-7";

export const TOOLBAR = "flex justify-between items-center mb-4 gap-3 flex-wrap";

export const FORM_ERROR = "text-error text-sm mt-2";

// Field primitives for the admin app (slightly different from auth.styles).
export const FIELD = "flex flex-col gap-2 mb-4";

export const FIELD_LABEL = "text-sm font-medium text-ink-secondary";

export const FIELD_INPUT =
  "w-full h-10 bg-surface border border-transparent rounded-md px-3 py-2.5 text-sm text-ink outline-none transition-all motion-reduce:transition-none focus:bg-bg focus:border-accent";

export const FIELD_TEXTAREA =
  "w-full bg-surface border border-transparent rounded-md px-3 py-2.5 text-sm text-ink outline-none transition-all motion-reduce:transition-none focus:bg-bg focus:border-accent min-h-[320px] font-mono text-mono resize-y";

export const FIELD_ROW = "grid gap-4 md:grid-cols-2";

export const CHIP =
  "h-7 px-3 rounded-pill bg-surface text-xs text-ink inline-flex items-center gap-1.5";
export const CHIP_WARNING = "bg-warning-surface text-warning";
export const CHIP_SUCCESS = "bg-success-surface text-success";
export const CHIP_MUTED = "text-ink-tertiary";
export const CHIP_PUBLIC = "bg-success-surface text-success";
export const CHIP_UNLISTED = "bg-warning-surface text-warning";
export const CHIP_PRIVATE = "bg-surface text-ink-tertiary";
export const CHIP_ACTIVE = "bg-accent text-white";

export const EMPTY_STATE =
  "border border-dashed border-hairline-strong rounded-lg px-6 py-12 text-center text-ink-secondary mt-6";

export const DATA_ROW =
  "grid grid-cols-[1fr_auto] gap-4 px-3 py-4 border-t border-hairline items-center last-of-type:border-b";

export const ROW_ACTIONS = "inline-flex gap-2";
