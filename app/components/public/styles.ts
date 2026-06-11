// Shared utility class strings for the public surface (P30–P34).

import {
  pillBtn,
  pillBtnPrimary,
  pillBtnTall,
  TOUCH_TARGET,
} from "../common/styles";

export const PUBLIC_HEADER =
  "sticky top-0 z-50 bg-[var(--header-bg)] py-[14px] px-6 grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-hairline supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(20px)] supports-[backdrop-filter]:[-webkit-backdrop-filter:saturate(180%)_blur(20px)] max-sm:px-4 max-sm:py-3 max-sm:gap-2.5";

export const PUBLIC_HEADER_LEFT = "flex items-center gap-3";

export const PUBLIC_HEADER_SEARCH =
  "max-w-[380px] w-full mx-auto relative max-sm:hidden";

export const PUBLIC_HEADER_SEARCH_INPUT =
  "w-full h-9 border-0 bg-surface rounded-pill pl-[38px] pr-4 text-sm font-inherit text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary focus:bg-surface-hover";

export const PUBLIC_HEADER_RIGHT = "flex items-center gap-2";

export const PUBLIC_TEXT_LINK =
  "text-sm font-medium text-ink px-2.5 h-9 inline-flex items-center rounded-md transition-colors motion-reduce:transition-none hover:bg-surface";

export const PUBLIC_TEXT_LINK_SIGNUP = `${PUBLIC_TEXT_LINK} max-sm:hidden`;

// pillBtnPrimary is appended for every consumer: `data-primary` ones (e.g.
// ErrorPage「ホームへ戻る」) resolve to accent, bare ones keep base surface.
export const PILL_BTN = `${pillBtn} ${pillBtnPrimary}`;

// `w-full` pins the container to the parent's width. Without it, the `mx-auto`
// cross-axis auto margin cancels `align-items: stretch` inside PublicLayout's
// `flex flex-col`, so the container shrinks to `max-content` (content width) and
// its width tracks the longest note row / title / date.
export const PUBLIC_MAIN =
  "w-full max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]";

export const PUBLIC_FOOTER = "border-t border-hairline pt-7 pb-10 mt-4";

// Mock footer-inner is a row with `justify-between` + `flex-wrap` at sm+ and
// stacks (`flex-direction:column`) on the 390px mobile mock. The `max-sm:flex-col`
// makes `justify-between` inert below sm so the brand/links read top-to-bottom.
export const PUBLIC_FOOTER_INNER =
  "max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] flex justify-between gap-4 flex-wrap text-sm text-ink-tertiary max-sm:flex-col";

export const PUBLIC_FOOTER_LINKS = "flex gap-4.5 flex-wrap";

export const PUBLIC_FOOTER_LINK =
  "transition-colors motion-reduce:transition-none hover:text-ink";

export const SEARCH_ICON =
  "absolute left-[11px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none";

// ===== Note row / list (P30) =====
export const NOTE_LIST = "mt-2 pb-16";
// Desktop: 2-col grid (main | short right-rail date). Mobile mock (P30) stacks
// the row (`flex-direction:column`) and folds the date into the meta line, so
// below sm we collapse to one column and hide the redundant right-rail
// `NOTE_DATE` (the meta row already carries the full「更新」date).
export const NOTE_ROW =
  "grid grid-cols-[1fr_auto] gap-6 px-3 py-5 border-t border-hairline transition-[background] duration-[120ms] motion-reduce:transition-none items-center text-inherit hover:bg-surface max-sm:grid-cols-1 max-sm:gap-1.5 max-sm:items-start max-sm:px-1";
export const NOTE_MAIN = "min-w-0";
export const NOTE_TITLE_ROW = "flex items-center gap-2 mb-1";
export const NOTE_TITLE =
  "text-md font-medium text-ink tracking-tight overflow-hidden text-ellipsis whitespace-nowrap";
export const NOTE_SNIPPET =
  "text-sm text-ink-secondary leading-[1.45] overflow-hidden mb-1.5 [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]";
export const NOTE_META =
  "text-sm text-ink-tertiary flex items-center gap-2.5 flex-wrap";
export const NOTE_TAGS = "text-accent text-sm";
// Right-rail date for the sm+ 2-col row; hidden on mobile where the stacked
// layout folds the date into the meta line (mock P30).
export const NOTE_DATE =
  "text-sm text-ink-tertiary whitespace-nowrap max-sm:hidden";
export const EMPTY_LIST = "px-3 py-20 text-center text-ink-secondary text-md";

// ===== P30 profile =====
export const PROFILE_HERO =
  "py-14 pb-9 grid grid-cols-[auto_1fr] gap-7 items-center border-b border-hairline max-sm:gap-4 max-sm:py-8 max-sm:pb-7";
export const PROFILE_AVATAR =
  "w-24 h-24 rounded-full bg-gradient-to-br from-[#c9d3df] to-[#8e99a8] text-white text-3xl font-medium inline-flex items-center justify-center shrink-0 max-sm:w-16 max-sm:h-16 max-sm:text-[22px]";
export const PROFILE_NAME =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-1.5 max-sm:text-[26px]";
export const PROFILE_USERNAME = "text-md text-ink-secondary mb-3";
export const PROFILE_BIO =
  "text-base text-ink leading-relaxed max-w-[var(--content-max)] mb-3.5 text-pretty";
export const PROFILE_STATS =
  "flex items-center gap-4.5 text-sm text-ink-secondary flex-wrap";

export const USER_TOOLS = "py-7 pb-3.5 flex flex-col gap-4";
export const USER_SEARCH = "relative max-w-[560px]";
export const USER_SEARCH_INPUT =
  "w-full h-10 border-0 bg-surface rounded-pill pl-10 pr-4 text-sm text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary focus:bg-surface-hover";

// ===== P30 filter chips / display segmented / sort =====
// Chips toggle URL `tags`; the active variant inverts to the ink fill, and
// selected chips carry an inline remove (×) affordance.
export const FILTER_ROW = "flex items-center gap-2 flex-wrap";
export const CHIP =
  "h-[30px] px-[13px] rounded-pill bg-surface text-[13px] text-ink inline-flex items-center gap-[5px] transition-colors motion-reduce:transition-none hover:bg-surface-hover data-[active]:bg-ink data-[active]:text-white";
export const CHIP_REMOVE =
  "text-sm text-ink-tertiary ml-[2px] leading-none [.group[data-active]_&]:text-white/70";

export const TOOLBAR = "flex justify-between items-center my-2 gap-3 flex-wrap";
export const SEGMENTED = "bg-surface rounded-[9px] p-[2px] inline-flex";
export const SEGMENTED_BTN =
  "px-[14px] py-[6px] rounded-[7px] text-[13px] font-medium text-ink bg-transparent inline-flex items-center gap-[5px] transition-all duration-[180ms] motion-reduce:transition-none data-[active]:bg-white data-[active]:shadow-xs";
export const SORT_BTN =
  "text-[13px] text-ink-secondary inline-flex items-center gap-1 px-2 py-[6px] rounded-md transition-colors motion-reduce:transition-none hover:bg-surface hover:text-ink";

// Tile view — same card system as P31 related.
export const TILE_GRID =
  "mt-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4";
export const TILE_CARD =
  "rounded-lg border border-hairline overflow-hidden bg-bg transition-colors motion-reduce:transition-none hover:bg-surface text-inherit block";
export const TILE_BODY = "px-4 py-3";
export const TILE_TITLE =
  "mb-1.5 text-md font-medium text-ink overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]";
export const TILE_SNIPPET =
  "mb-1.5 text-sm text-ink-secondary overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]";
export const TILE_META =
  "flex items-center gap-2.5 flex-wrap text-sm text-ink-tertiary";

// Calendar view — day grouping mirrors the auth-side CalendarView.
export const CAL_WRAP = "mt-3 flex flex-col gap-5";
export const CAL_DAY_TITLE =
  "mb-2 pb-2 border-b border-hairline text-sm font-medium text-ink-secondary";
export const CAL_DAY_LIST = "flex flex-col gap-1";
export const CAL_ITEM =
  "block text-sm text-ink px-2 py-1.5 rounded-sm transition-colors motion-reduce:transition-none hover:bg-surface hover:text-accent text-inherit";

// ===== P31 detail =====
// `w-full` for the same reason as PUBLIC_MAIN.
export const NOTE_DETAIL_WRAP =
  "w-full max-w-[920px] mx-auto px-[var(--container-padding)] pt-8 pb-16";
export const NOTE_DETAIL_BREADCRUMB =
  "flex items-center gap-1.5 text-sm text-ink-tertiary mb-4 flex-wrap";
export const DOC_TITLE =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-4.5 max-w-[var(--content-max)] max-sm:text-[26px]";
export const NOTE_META_INLINE =
  "flex items-center gap-2.5 text-sm text-ink-tertiary flex-wrap mb-4.5";
export const PUB_PILL =
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-success-surface text-success text-[11px] font-medium";
export const PUB_PILL_DOT = "w-1.5 h-1.5 rounded-full bg-success";
export const AUTHOR_MINI =
  "inline-flex items-center gap-2.5 py-1.5 pr-3 pl-1.5 rounded-pill bg-surface mb-4.5";
export const AUTHOR_AVATAR =
  "w-7 h-7 rounded-full bg-gradient-to-br from-[#c9d3df] to-[#8e99a8] text-white text-[11px] font-medium inline-flex items-center justify-center";

// Tag row + 公開/更新 dates re-stated at the end of the article body, above
// the backlink / related sections.
export const NOTE_BOTTOM_META =
  "max-w-[var(--content-max)] mt-12 pt-5 border-t border-hairline flex flex-col gap-1.5 text-sm text-ink-tertiary";
export const NOTE_BOTTOM_META_TAGS = "flex gap-1 flex-wrap";

export const SECTION_BLOCK = "max-w-[var(--content-max)] mt-12";
export const SECTION_TITLE =
  "text-xs font-medium text-ink-tertiary uppercase tracking-wider mb-3.5";
export const BACKLINK_LIST = "flex flex-col gap-0.5";
export const BACKLINK_ITEM =
  "py-3 px-3.5 rounded-md flex items-center gap-2.5 transition-colors motion-reduce:transition-none text-inherit hover:bg-surface";
export const BACKLINK_ICON = "text-ink-tertiary shrink-0";
export const BACKLINK_TEXT = "text-sm text-ink";
export const RELATED_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 mt-1";
export const RELATED_CARD =
  "p-4 px-4.5 border border-hairline rounded-lg bg-bg transition-colors motion-reduce:transition-none flex flex-col gap-1.5 text-inherit hover:bg-surface-elevated hover:border-hairline-strong";
export const RELATED_TITLE =
  "text-sm font-medium text-ink tracking-tight leading-snug";
export const RELATED_META = "text-xs text-ink-tertiary";
export const RELATED_TAGS = "text-accent mr-1.5";

// ===== P32 search =====
// Mock `.hero`: centered, max-w 720, padding 64/24 (PC) / 36/16 (mobile).
export const SEARCH_HERO =
  "max-w-[720px] mx-auto text-center pt-16 pb-6 max-sm:pt-9 max-sm:pb-4";
export const SEARCH_HERO_H1 =
  "text-2xl font-normal tracking-tightest text-ink mb-1.5";
export const SEARCH_HERO_SUB = "text-sm text-ink-secondary mb-6";
export const SEARCH_FORM = "relative max-w-[640px] mx-auto";
// Mock `.hero-search input`: surface fill, no border, 56px (PC) / 48px (mobile),
// left padding 54/46 to clear the icon, focus swaps to surface-hover + shadow.
// `text-md` token mirrors the mock's `--text-md` (padding stays an arbitrary
// value since no standard scale token matches 54px/46px).
export const SEARCH_FORM_INPUT =
  "w-full h-14 max-sm:h-12 border-0 bg-surface rounded-pill pl-[54px] max-sm:pl-[46px] pr-14 text-md text-ink outline-none transition-colors motion-reduce:transition-none focus:bg-surface-hover focus:shadow-focus placeholder:text-ink-tertiary";
// Center-anchored so it stays within the input even when the base `pillBtn`
// `TOUCH_TARGET` tap floor fires on mobile (see .issue/417/adr.md ADR-004).
// Requires `data-primary` on the consumer button.
export const SEARCH_FORM_BUTTON = `${pillBtn} ${pillBtnPrimary} absolute right-1.5 top-1/2 -translate-y-1/2`;
// Mock `.hero-icon`: left 22px (PC) / 18px (mobile), aligned with the input padding.
export const SEARCH_FORM_ICON =
  "absolute left-[22px] max-sm:left-[18px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none";

export const SEARCH_SUMMARY =
  "py-4 pb-2 text-sm text-ink-secondary flex gap-3 items-center flex-wrap";
export const SEARCH_HIT_LIST = "mt-2 pb-16";
// Single-column card (no date right-rail in scope; see .issue/617/adr.md ADR-001).
export const SEARCH_HIT_ROW =
  "flex flex-col gap-1 py-5 px-3 max-sm:py-4 max-sm:px-2 border-t border-hairline transition-[background] duration-[120ms] motion-reduce:transition-none text-inherit hover:bg-surface";
export const SEARCH_HIT_AUTHOR =
  "inline-flex items-center gap-1 text-sm text-ink-secondary";
export const SEARCH_HIT_TITLE =
  "text-md font-medium text-ink tracking-tight leading-snug";
export const SEARCH_HIT_SNIPPET =
  "text-sm text-ink-secondary leading-relaxed overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]";
export const SEARCH_HIT_META =
  "text-sm text-ink-tertiary flex items-center gap-2.5 flex-wrap";
export const SEARCH_EMPTY = "py-20 px-3 text-center text-ink-secondary";
export const PAGINATION = "mt-6 flex justify-between gap-3 flex-wrap";

// ===== P32 filter bar / active chips / drawer =====
export const FILTER_BAR =
  "flex items-center justify-between gap-3 flex-wrap py-2 pb-1 mb-2";
export const FILTER_BAR_LEFT =
  "flex items-center gap-2.5 flex-wrap flex-1 min-w-0";
export const FILTER_BAR_RIGHT = "flex items-center gap-2";
export const RESULTS_COUNT = "text-sm text-ink-secondary";
// `has-active` swaps to the accent surface, rendered via `data-active`. The
// mobile mock raises it to the 44px tap floor.
export const FILTER_BTN =
  "h-9 px-3.5 rounded-pill bg-surface text-[13px] font-medium text-ink inline-flex items-center gap-1.5 relative transition-colors motion-reduce:transition-none hover:bg-surface-hover data-[active]:bg-accent-surface data-[active]:text-accent-ink max-sm:h-11";
export const FILTER_BTN_BADGE =
  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-pill bg-accent text-white text-[11px] font-semibold ml-0.5";
// Relevance-order label is fixed (no toggle).
export const SORT_LABEL =
  "h-9 px-3 rounded-pill text-[13px] text-ink-secondary inline-flex items-center gap-1 max-sm:h-11";

// Row hides itself when empty via the caller (no `:empty` selector in
// Tailwind — the caller omits the row).
export const ACTIVE_CHIPS =
  "flex flex-wrap gap-1.5 pb-3 border-b border-hairline mb-1";
export const ACTIVE_CHIP =
  "inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-pill bg-accent-surface text-accent-ink text-xs font-medium transition-colors motion-reduce:transition-none hover:bg-accent-surface-hover";
export const ACTIVE_CHIP_AVATAR = `${AUTHOR_AVATAR} w-4 h-4 text-[8px]`;
export const ACTIVE_CHIP_REMOVE =
  "w-[18px] h-[18px] inline-flex items-center justify-center rounded-full text-accent-ink opacity-60 transition-[opacity,background-color] motion-reduce:transition-none hover:opacity-100 hover:bg-ink/[0.06]";
export const ACTIVE_CHIPS_CLEAR =
  "text-xs text-ink-tertiary px-2 h-7 inline-flex items-center rounded-pill transition-colors motion-reduce:transition-none hover:bg-surface hover:text-ink";

// Right-anchored slide-in at every viewport. Open state is driven by
// `data-open` so the transition runs; `pointer-events` flips with it.
export const DRAWER_BACKDROP =
  "fixed inset-0 bg-black/[0.32] opacity-0 pointer-events-none z-[90] transition-opacity duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none data-[open]:opacity-100 data-[open]:pointer-events-auto";
export const DRAWER =
  "fixed top-0 right-0 bottom-0 w-[min(420px,100vw)] bg-bg shadow-lg z-[100] flex flex-col translate-x-full transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none data-[open]:translate-x-0";
export const DRAWER_HEADER =
  "flex items-center justify-between px-5 py-4 border-b border-hairline shrink-0";
export const DRAWER_TITLE = "text-base font-semibold tracking-tight text-ink";
export const DRAWER_CLOSE =
  "w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-secondary transition-colors motion-reduce:transition-none hover:bg-surface hover:text-ink";
export const DRAWER_BODY = "flex-1 overflow-y-auto pt-2 pb-4";
export const DRAWER_FOOTER =
  "flex items-center justify-between gap-3 px-5 py-3.5 border-t border-hairline shrink-0 bg-bg";
export const DRAWER_RESET =
  "text-[13px] text-ink-secondary px-1 py-2 transition-colors motion-reduce:transition-none hover:text-ink";
export const DRAWER_APPLY =
  "h-10 px-5 rounded-pill bg-accent text-white text-sm font-medium transition-colors motion-reduce:transition-none hover:bg-accent-hover";

export const FACET_SECTION =
  "px-5 pt-4 pb-2 border-b border-hairline last:border-b-0";
export const FACET_HEADER = "flex items-center justify-between mb-2.5";
export const FACET_TITLE = "text-[13px] font-semibold tracking-tight text-ink";
export const FACET_SELECTED_COUNT = "text-[11px] text-ink-tertiary";
export const FACET_HINT = "mt-1.5 text-[11px] text-ink-tertiary";

export const TOKEN_INPUT =
  "relative min-h-10 border border-hairline bg-bg rounded-md px-2 py-[5px] flex flex-wrap items-center gap-1 cursor-text transition-colors motion-reduce:transition-none focus-within:border-hairline-strong focus-within:shadow-focus";
export const TOKEN =
  "inline-flex items-center gap-1 h-[26px] pl-2 pr-1 rounded-pill bg-accent-surface text-accent-ink text-xs font-medium max-w-full";
export const TOKEN_LABEL =
  "overflow-hidden text-ellipsis whitespace-nowrap inline-flex items-center gap-1.5";
export const TOKEN_AVATAR = `${AUTHOR_AVATAR} w-4 h-4 text-[8px] shrink-0`;
export const TOKEN_REMOVE =
  "w-[18px] h-[18px] inline-flex items-center justify-center rounded-full text-accent-ink opacity-60 shrink-0 transition-[opacity,background-color] motion-reduce:transition-none hover:opacity-100 hover:bg-ink/[0.06]";
export const TOKEN_FIELD =
  "flex-1 min-w-[100px] h-[26px] border-0 bg-transparent text-[13px] text-ink outline-none px-1 placeholder:text-ink-tertiary";

export const SUGGESTIONS =
  "mt-1.5 border border-hairline rounded-md bg-bg shadow-sm max-h-[220px] overflow-y-auto";
export const SUGGESTION_ITEM =
  "flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink cursor-pointer border-b border-hairline last:border-b-0 transition-colors motion-reduce:transition-none hover:bg-surface data-[active]:bg-surface text-left w-full";
export const SUGGESTION_LABEL =
  "flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap inline-flex items-center gap-2";
export const SUGGESTION_AVATAR = `${AUTHOR_AVATAR} w-5 h-5 text-[9px] shrink-0`;
export const SUGGESTION_EMPTY =
  "px-3 py-3.5 text-xs text-ink-tertiary text-center";

export const FACET_LIST = "flex flex-col -mx-2";
export const FACET_ITEM =
  "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-ink cursor-pointer transition-colors motion-reduce:transition-none hover:bg-surface";
export const FACET_RADIO =
  "w-[15px] h-[15px] m-0 shrink-0 cursor-pointer accent-accent";
export const FACET_LABEL =
  "flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
export const FACET_COUNT = "text-xs text-ink-tertiary tabular-nums shrink-0";

// ===== P33 share-link gate =====
export const SHARE_PAGE =
  "flex-1 flex items-center justify-center px-[var(--container-padding)] py-14 min-h-[calc(100vh-var(--header-height)-120px)]";
export const GATE_CARD =
  "max-w-[440px] w-full bg-bg border border-hairline rounded-xl pt-10 px-9 pb-9 shadow-xs max-sm:pt-8 max-sm:px-6 max-sm:pb-7";
export const GATE_ICON =
  "w-14 h-14 rounded-full bg-warning-surface text-warning flex items-center justify-center mx-auto mb-5 data-[expired]:bg-error-surface data-[expired]:text-error";
export const GATE_TITLE =
  "text-xl font-semibold tracking-tighter text-ink text-center mb-2 leading-snug";
export const GATE_SUB =
  "text-sm text-ink-secondary text-center leading-relaxed mb-6";
export const GATE_FORM = "flex flex-col gap-3";
export const GATE_LABEL = "text-sm text-ink-secondary font-medium";
export const GATE_INPUT =
  "w-full h-11 border border-hairline-strong bg-white rounded-md px-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-[150ms] motion-reduce:transition-none focus:border-accent focus:shadow-focus data-[error]:border-error";
export const GATE_ERROR = "text-sm text-error -mt-1 flex items-center gap-1.5";
// Same composition as auth `BTN_PRIMARY`. Requires `data-primary` on the
// consumer button, else the accent variant never applies and it renders surface.
export const GATE_SUBMIT = `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full mt-2`;
export const SHARE_NOTE_BANNER =
  "flex items-center gap-2 px-3.5 py-2.5 bg-warning-surface text-warning rounded-md text-sm mb-6";

// ===== P34 error =====
export const ERR_PAGE =
  "flex-1 flex items-center justify-center px-[var(--container-padding)] py-14 pb-20 min-h-[calc(100vh-var(--header-height)-120px)]";
export const ERR_INNER = "max-w-[560px] w-full text-center";
export const ERR_CODE =
  "text-[clamp(96px,18vw,168px)] font-light tracking-tightest leading-none text-ink mb-2 bg-gradient-to-b from-ink to-ink-secondary bg-clip-text text-transparent";
export const ERR_TITLE =
  "text-2xl font-semibold tracking-tighter text-ink mb-3 leading-snug max-sm:text-[22px]";
export const ERR_DESC =
  "text-md text-ink-secondary leading-relaxed mx-auto mb-8 max-w-[440px]";
// Desktop: centered horizontal wrap. Mobile mock (P34): `flex-direction:column;
// align-items:stretch` with every CTA `width:100%`. The `max-sm:[&>*]:w-full`
// stretches the child `pill-btn`s/buttons full-width without mutating the shared
// `PILL_BTN` constant (also used by pagination) — scoped to this actions row.
export const ERR_ACTIONS =
  "flex gap-2.5 justify-center flex-wrap mb-6 max-sm:flex-col max-sm:items-stretch max-sm:[&>*]:w-full";
// Mock `.back-link` normalized to tokens / Tailwind standard scale (no literal px).
// Mobile mock centers the label and applies the shared `TOUCH_TARGET` tap floor.
export const BACK_LINK = `inline-flex items-center gap-1 text-sm text-ink-tertiary px-2.5 py-1.5 rounded-md transition-colors motion-reduce:transition-none hover:text-ink hover:bg-surface max-sm:justify-center ${TOUCH_TARGET}`;
export const ERR_META = "text-xs text-ink-tertiary font-mono mt-3";
