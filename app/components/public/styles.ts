// Shared utility class strings for the public surface (P30–P34).

export const PUBLIC_HEADER =
  "sticky top-0 z-50 bg-[var(--header-bg)] py-[14px] px-6 grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-hairline supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(20px)] supports-[backdrop-filter]:[-webkit-backdrop-filter:saturate(180%)_blur(20px)] max-sm:px-4 max-sm:py-3 max-sm:gap-2.5";

export const PUBLIC_HEADER_LEFT = "flex items-center gap-3";

export const PUBLIC_LOGO = "text-[21px] font-light tracking-tightest text-ink";

export const PUBLIC_HEADER_SEARCH =
  "max-w-[380px] w-full mx-auto relative max-sm:hidden";

export const PUBLIC_HEADER_SEARCH_INPUT =
  "w-full h-9 border-0 bg-surface rounded-pill pl-[38px] pr-4 text-sm font-inherit text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary focus:bg-surface-hover";

export const PUBLIC_HEADER_RIGHT = "flex items-center gap-2";

export const PUBLIC_TEXT_LINK =
  "text-sm font-medium text-ink px-2.5 h-9 inline-flex items-center rounded-md transition-colors motion-reduce:transition-none hover:bg-surface";

export const PUBLIC_TEXT_LINK_SIGNUP = `${PUBLIC_TEXT_LINK} max-sm:hidden`;

export const PILL_BTN =
  "h-9 px-4 rounded-pill bg-surface text-sm font-medium text-ink inline-flex items-center gap-1.5 transition-colors motion-reduce:transition-none hover:bg-surface-hover data-[primary]:bg-accent data-[primary]:text-white data-[primary]:hover:bg-accent-hover whitespace-nowrap max-sm:min-h-[44px]";

export const PUBLIC_MAIN =
  "max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]";

export const PUBLIC_FOOTER = "border-t border-hairline pt-7 pb-10 mt-4";

export const PUBLIC_FOOTER_INNER =
  "max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] flex justify-between gap-4 flex-wrap text-[13px] text-ink-tertiary";

export const PUBLIC_FOOTER_LINKS = "flex gap-4.5 flex-wrap";

export const PUBLIC_FOOTER_LINK =
  "transition-colors motion-reduce:transition-none hover:text-ink";

export const SEARCH_ICON =
  "absolute left-[13px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none";

// ===== Note row / list (P30) =====
export const NOTE_LIST = "mt-2 pb-16";
export const NOTE_ROW =
  "grid grid-cols-[1fr_auto] gap-6 px-3 py-5 border-t border-hairline transition-[background] duration-[120ms] motion-reduce:transition-none items-center text-inherit hover:bg-surface";
export const NOTE_MAIN = "min-w-0";
export const NOTE_TITLE_ROW = "flex items-center gap-2 mb-1";
export const NOTE_TITLE =
  "text-md font-medium text-ink tracking-tight overflow-hidden text-ellipsis whitespace-nowrap";
export const NOTE_SNIPPET =
  "text-sm text-ink-secondary leading-[1.45] overflow-hidden mb-1.5 [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]";
export const NOTE_META =
  "text-[13px] text-ink-tertiary flex items-center gap-2.5 flex-wrap";
export const NOTE_TAGS = "text-accent text-[13px]";
export const NOTE_DATE =
  "text-[13px] text-ink-tertiary whitespace-nowrap max-sm:text-xs";
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
  "text-base text-ink leading-relaxed max-w-[60ch] mb-3.5";
export const PROFILE_STATS =
  "flex items-center gap-4.5 text-sm text-ink-secondary flex-wrap";

export const USER_TOOLS = "py-7 pb-3.5 flex flex-col gap-4";
export const USER_SEARCH = "relative max-w-[560px]";
export const USER_SEARCH_INPUT =
  "w-full h-10 border-0 bg-surface rounded-pill pl-10 pr-4 text-sm text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary focus:bg-surface-hover";
export const USER_SEARCH_ICON =
  "absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none";

// ===== P31 detail =====
export const NOTE_DETAIL_WRAP =
  "max-w-[920px] mx-auto px-[var(--container-padding)] pt-8 pb-16";
export const NOTE_DETAIL_BREADCRUMB =
  "flex items-center gap-1.5 text-[13px] text-ink-tertiary mb-4 flex-wrap";
export const DOC_TITLE =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-4.5 max-w-[var(--content-max)] max-sm:text-[26px]";
export const NOTE_META_INLINE =
  "flex items-center gap-2.5 text-[13px] text-ink-tertiary flex-wrap mb-4.5";
export const PUB_PILL =
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-success-surface text-success text-[11px] font-medium";
export const PUB_PILL_DOT = "w-1.5 h-1.5 rounded-full bg-success";
export const AUTHOR_MINI =
  "inline-flex items-center gap-2.5 py-1.5 pr-3 pl-1.5 rounded-pill bg-surface mb-4.5";
export const AUTHOR_AVATAR =
  "w-7 h-7 rounded-full bg-gradient-to-br from-[#c9d3df] to-[#8e99a8] text-white text-[11px] font-medium inline-flex items-center justify-center";
export const BACKLINKS = "mt-16 pt-6 border-t border-hairline";

// ===== P32 search =====
export const SEARCH_HERO = "py-12 pb-6 text-left";
export const SEARCH_HERO_H1 =
  "text-2xl font-normal tracking-tightest text-ink mb-4";
export const SEARCH_FORM = "relative max-w-[640px]";
export const SEARCH_FORM_INPUT =
  "w-full h-12 border border-hairline bg-bg rounded-pill pl-12 pr-14 text-[15px] text-ink outline-none transition-colors motion-reduce:transition-none focus:border-hairline-strong focus:shadow-focus";
export const SEARCH_FORM_BUTTON =
  "absolute right-1.5 top-1.5 h-9 px-4 rounded-pill bg-accent text-white text-sm font-medium transition-colors motion-reduce:transition-none hover:bg-accent-hover";
export const SEARCH_FORM_ICON =
  "absolute left-[18px] top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none";

export const SEARCH_SUMMARY =
  "py-4 pb-2 text-sm text-ink-secondary flex gap-3 items-center flex-wrap";
export const SEARCH_HIT_LIST = "mt-2 pb-16";
export const SEARCH_HIT_ROW =
  "block py-5 px-3 border-t border-hairline transition-[background] duration-[120ms] motion-reduce:transition-none text-inherit hover:bg-surface";
export const SEARCH_HIT_AUTHOR =
  "inline-flex items-center gap-1.5 text-xs text-ink-tertiary mb-1.5";
export const SEARCH_HIT_TITLE =
  "text-md font-medium text-ink tracking-tight mb-1";
export const SEARCH_HIT_SNIPPET =
  "text-sm text-ink-secondary leading-normal mb-1.5";
export const SEARCH_HIT_META =
  "text-xs text-ink-tertiary flex gap-2.5 flex-wrap";
export const SEARCH_EMPTY = "py-20 px-3 text-center text-ink-secondary";
export const PAGINATION = "mt-6 flex justify-between gap-3 flex-wrap";

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
export const GATE_LABEL = "text-[13px] text-ink-secondary font-medium";
export const GATE_INPUT =
  "w-full h-11 border border-hairline-strong bg-white rounded-md px-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-[150ms] motion-reduce:transition-none focus:border-accent focus:shadow-focus data-[error]:border-error";
export const GATE_ERROR =
  "text-[13px] text-error -mt-1 flex items-center gap-1.5";
export const GATE_SUBMIT =
  "w-full h-11 mt-2 rounded-pill bg-accent text-white text-[15px] font-medium transition-colors motion-reduce:transition-none hover:not-disabled:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed";
export const GATE_FOOT =
  "mt-6 pt-5 border-t border-hairline text-xs text-ink-tertiary text-center";
export const LOCKOUT =
  "bg-warning-surface border border-warning text-warning rounded-md px-3.5 py-2.5 text-[13px] flex items-center gap-2 mb-4.5";
export const SHARE_NOTE_BANNER =
  "flex items-center gap-2 px-3.5 py-2.5 bg-warning-surface text-warning rounded-md text-[13px] mb-6";

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
export const ERR_ACTIONS = "flex gap-2.5 justify-center flex-wrap mb-6";
export const ERR_META = "text-xs text-ink-tertiary font-mono mt-3";
