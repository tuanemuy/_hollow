// Shared utility class strings used across the authenticated app shell.

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

export const PILL_BTN =
  "h-9 px-4 rounded-pill bg-surface text-sm font-medium text-ink inline-flex items-center gap-1.5 transition-colors motion-reduce:transition-none whitespace-nowrap hover:bg-surface-hover active:bg-surface-hover active:scale-[0.985] motion-reduce:active:scale-100 data-[primary]:bg-accent data-[primary]:text-white data-[primary]:hover:bg-accent-hover data-[primary]:active:bg-accent-pressed data-[danger]:bg-error-surface data-[danger]:text-error aria-disabled:opacity-55 aria-disabled:cursor-not-allowed disabled:opacity-55 disabled:cursor-not-allowed max-sm:min-h-[44px]";

export const ICON_BTN =
  "w-9 h-9 rounded-full bg-surface inline-flex items-center justify-center text-ink transition-colors motion-reduce:transition-none hover:bg-surface-hover max-sm:min-w-[44px] max-sm:min-h-[44px]";

export const AVATAR =
  "w-8 h-8 rounded-full bg-gradient-to-br from-[#c9d3df] to-[#8e99a8] text-white text-xs font-medium inline-flex items-center justify-center no-underline";

export const APP_LAYOUT =
  "grid grid-cols-1 min-h-[calc(100vh-var(--header-height))]";

export const APP_LAYOUT_WITH_SIDEBAR = `${APP_LAYOUT} lg:grid-cols-[var(--sidebar-width)_1fr]`;

export const APP_SIDEBAR =
  "px-4 pt-3 pb-8 overflow-y-auto bg-bg border-b border-hairline lg:border-b-0 lg:border-r";

export const SIDEBAR_SECTION = "mb-7";

export const SIDEBAR_SECTION_TITLE =
  "text-[11px] font-medium text-ink-tertiary uppercase tracking-[0.06em] px-3 mb-1.5";

export const NAV_ITEM =
  "relative flex items-center gap-2 px-3 py-[7px] rounded-md text-sm text-ink cursor-pointer transition-colors motion-reduce:transition-none select-none no-underline hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-medium data-[active]:bg-surface data-[active]:font-medium";

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

export const ROW_ACTIONS_SMALL_PILL =
  "h-[30px] px-3 rounded-pill bg-surface text-[13px] font-medium text-ink inline-flex items-center gap-1.5 transition-colors motion-reduce:transition-none whitespace-nowrap hover:bg-surface-hover data-[primary]:bg-accent data-[primary]:text-white data-[primary]:hover:bg-accent-hover data-[danger]:bg-error-surface data-[danger]:text-error";
