// Shared utility class strings used across the authenticated app shell.

import { navItem } from "../common/styles";

export const APP_HEADER =
  "sticky top-0 z-50 h-[var(--header-height)] grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-hairline bg-[var(--header-bg)] px-6 py-[14px] supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(20px)] supports-[backdrop-filter]:[-webkit-backdrop-filter:saturate(180%)_blur(20px)]";

export const APP_HEADER_LEFT = "flex items-center gap-3";
export const APP_HEADER_RIGHT = "flex items-center gap-2";
export const APP_LOGO = "text-[21px] font-light tracking-tightest text-ink";

export const SEARCH_BOX_WRAPPER = "max-w-[460px] w-full mx-auto relative";

export const SEARCH_BOX_INPUT =
  "w-full h-9 border-0 bg-surface rounded-pill pl-[38px] pr-4 text-sm text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary hover:bg-surface-hover focus:bg-surface-hover";

export const SEARCH_BOX_ICON =
  "absolute left-[11px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none";

export const ICON_BTN =
  "w-9 h-9 rounded-full bg-surface inline-flex items-center justify-center text-ink transition-colors motion-reduce:transition-none hover:bg-surface-hover max-sm:min-w-[44px] max-sm:min-h-[44px]";

export const AVATAR =
  "w-8 h-8 rounded-full bg-gradient-to-br from-[#c9d3df] to-[#8e99a8] text-white text-xs font-medium inline-flex items-center justify-center no-underline cursor-pointer";

// User menu (header avatar dropdown). Mirrors the WAI-ARIA menu pattern used
// by `directory/DirectoryActionsMenu`, anchored to the right edge under the
// avatar.
export const USER_MENU_WRAPPER = "relative";

export const USER_MENU_PANEL =
  "absolute right-0 mt-2 z-50 min-w-[220px] rounded-md border border-hairline bg-bg shadow-md py-1";

export const USER_MENU_INFO =
  "flex flex-col gap-0.5 px-3 py-2.5 border-b border-hairline";

export const USER_MENU_INFO_NAME = "text-sm font-medium text-ink truncate";

export const USER_MENU_INFO_EMAIL = "text-xs text-ink-secondary truncate";

export const USER_MENU_INFO_ROLE = "text-xs text-ink-tertiary";

export const USER_MENU_ITEM =
  "flex items-center w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface focus:bg-surface outline-none disabled:opacity-disabled disabled:cursor-not-allowed data-[danger]:text-error data-[danger]:hover:bg-error-surface";

export const APP_LAYOUT =
  "grid grid-cols-1 min-h-[calc(100vh-var(--header-height))]";

export const APP_LAYOUT_WITH_SIDEBAR = `${APP_LAYOUT} lg:grid-cols-[var(--sidebar-width)_1fr]`;

// Below `lg` the sidebar is an off-canvas drawer (Issue #354): fixed, slid
// out by default, revealed via `data-open`. At `lg` and up it returns to the
// in-flow sticky column. New media queries are avoided in favour of
// `max-lg:` / `lg:` variants so the `--breakpoint-*` duplication does not
// need touching (see CLAUDE.md styling notes).
export const APP_SIDEBAR =
  "px-4 pt-5 pb-8 overflow-y-auto bg-bg max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-[280px] max-lg:z-[100] max-lg:-translate-x-full max-lg:shadow-md max-lg:transition-transform max-lg:motion-reduce:transition-none data-[open]:max-lg:translate-x-0 lg:sticky lg:top-[var(--header-height)] lg:h-[calc(100vh-var(--header-height))] lg:border-r lg:border-hairline";

// Scrim behind the mobile drawer; clicking it closes the drawer. Shown only
// below `lg` and only while open, regardless of generated-CSS source order.
export const SIDEBAR_BACKDROP =
  "fixed inset-0 z-[90] bg-black/20 hidden data-[open]:max-lg:block";

// Hamburger that toggles the drawer. Hidden once the sidebar is in-flow at
// `lg`.
export const MENU_BTN =
  "lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-md text-ink transition-colors motion-reduce:transition-none hover:bg-surface max-sm:min-w-[44px] max-sm:min-h-[44px]";

export const SIDEBAR_SECTION = "mb-7";

export const SIDEBAR_SECTION_TITLE =
  "text-[11px] font-medium text-ink-tertiary uppercase tracking-[0.06em] px-3 mb-1.5";

// Sidebar nav link = shared `navItem` base + sidebar-only surface highlight
// (the active background is painted on the link here, unlike the directory
// tree where it lives on the row).
export const NAV_ITEM = `${navItem} relative hover:bg-surface aria-[current=page]:bg-surface data-[active]:bg-surface`;

export const APP_MAIN = "px-6 pt-8 pb-20 max-w-[1100px] mx-auto w-full min-w-0";

// Shared icon class for empty-state eyecatches (paired with `EMPTY_STATE`).
// `block` makes `mx-auto` work for the inline-by-default SVG.
export const EMPTY_STATE_ICON = "block mx-auto mb-3 text-ink-tertiary";

export const PAGE_TITLE =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-2.5 [overflow-wrap:anywhere] min-w-0";

export const PAGE_SUBTITLE = "text-[15px] text-ink-secondary mb-7";

export const TOOLBAR = "flex justify-between items-center mb-4 gap-3 flex-wrap";

export const FORM_ERROR = "text-error text-[13px] mt-2";

// Field primitives for the admin app (slightly different from auth.styles).
export const FIELD = "flex flex-col gap-2 mb-4";

export const FIELD_LABEL = "text-[13px] font-medium text-ink-secondary";

export const FIELD_INPUT =
  "w-full bg-surface border border-transparent rounded-md px-3 py-2.5 text-sm text-ink outline-none transition-all motion-reduce:transition-none focus:bg-bg focus:border-accent";

export const FIELD_TEXTAREA =
  "w-full bg-surface border border-transparent rounded-md px-3 py-2.5 text-sm text-ink outline-none transition-all motion-reduce:transition-none focus:bg-bg focus:border-accent min-h-[320px] font-mono text-mono resize-y";

export const FIELD_ROW = "grid gap-4 md:grid-cols-2";

export const CHIP =
  "h-7 px-3 rounded-pill bg-surface text-xs text-ink inline-flex items-center gap-[5px]";
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
