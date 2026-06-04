// Shared utility class strings for the settings (identity) surface. Mirrors
// `auth/styles.ts`: composes the domain-agnostic primitives from
// `common/styles.ts` and keeps styles inline (no @apply). `/settings` is a
// top-level surface that does not inherit the app shell, so it owns its own
// layout constants rather than reusing `layout/styles.ts`.

import {
  field,
  fieldControl,
  fieldLabel,
  fieldTextarea,
  formError,
  pillBtn,
  pillBtnPrimary,
} from "../common/styles";

// ===== Layout (settings/route.tsx) =====

export const SETTINGS_WRAP = "w-full";

export const SETTINGS_HEADER =
  "max-w-[1100px] mx-auto w-full px-6 pt-8 lg:px-12";

export const SETTINGS_BACK_LINK =
  "inline-flex items-center gap-1 text-sm text-ink-secondary no-underline transition-colors motion-reduce:transition-none hover:text-ink mb-4";

export const SETTINGS_TITLE =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-1.5 [overflow-wrap:anywhere] min-w-0";

export const SETTINGS_SUBTITLE = "text-md text-ink-secondary mb-6";

// Single-column below `lg`; sub-nav rail + content at `lg`. New media queries
// are avoided in favour of `lg:` variants so the `--breakpoint-*` duplication
// stays untouched (CLAUDE.md styling notes).
export const SETTINGS_GRID =
  "max-w-[1100px] mx-auto w-full px-6 pb-24 grid grid-cols-1 gap-0 lg:px-12 lg:grid-cols-[220px_1fr] lg:gap-14";

// Sub-nav: horizontal scroll strip below `lg`, sticky vertical rail at `lg`.
export const SETTINGS_NAV =
  "flex gap-1 overflow-x-auto pb-4 mb-7 border-b border-hairline [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:gap-0.5 lg:overflow-x-visible lg:pb-0 lg:mb-0 lg:border-b-0 lg:sticky lg:top-[calc(var(--header-height)+32px)] lg:self-start";

// Active colour differs by breakpoint: the horizontal pill (below `lg`) uses an
// inked fill, the vertical rail item (`lg:`) uses the subtle surface fill. Both
// `aria-[current=page]:` and `data-[active]:` are kept so the highlight survives
// regardless of which attribute the consumer sets (aria-current is existing).
export const SETTINGS_NAV_ITEM =
  "inline-flex items-center gap-2 shrink-0 px-3.5 py-2 rounded-pill text-sm font-medium text-ink-secondary whitespace-nowrap no-underline cursor-pointer transition-colors motion-reduce:transition-none hover:bg-surface hover:text-ink max-lg:aria-[current=page]:bg-ink max-lg:aria-[current=page]:text-white max-lg:data-[active]:bg-ink max-lg:data-[active]:text-white lg:w-full lg:justify-start lg:rounded-md lg:aria-[current=page]:bg-surface lg:aria-[current=page]:text-ink lg:data-[active]:bg-surface lg:data-[active]:text-ink aria-[current=page]:font-medium data-[active]:font-medium";

export const SETTINGS_CONTENT = "max-w-[720px] w-full min-w-0";

// errorComponent
export const SETTINGS_ERROR_BOX =
  "max-w-[720px] mx-auto px-6 py-12 flex flex-col gap-3";

export const SETTINGS_ERROR_TITLE =
  "text-xl font-semibold tracking-tighter text-ink";

export const SETTINGS_ERROR_BODY =
  "bg-error-surface text-error rounded-md px-4 py-3 text-sm leading-normal whitespace-pre-wrap";

// ===== Form section (4 forms) =====

export const SECTION = "mb-12 last:mb-0";

export const SECTION_TITLE =
  "text-xl font-semibold tracking-tighter text-ink mb-1.5 flex items-center gap-2.5";

export const SECTION_DESC = "text-sm text-ink-secondary leading-normal mb-6";

// Replacement for the inline `<hr>` separators between same-form sub-sections.
export const SECTION_DIVIDER = "border-0 border-t border-hairline my-10";

export const FORM = "flex flex-col";

export const FIELD = field;

export const FIELD_LABEL = fieldLabel;

export const FIELD_INPUT = fieldControl;

export const FIELD_TEXTAREA = `${fieldControl} min-h-24 resize-y leading-normal`;

export const PROMPT_TEXTAREA = `${fieldControl} ${fieldTextarea} min-h-[140px] max-h-[300px]`;

export const FIELD_ERROR = formError;

export const SUCCESS_MSG = "text-success text-[13px] mt-2";

// Inline label + checkbox row (e.g. "他の端末からはログアウトする").
export const CHECKBOX_ROW =
  "flex items-center gap-2 text-sm text-ink-secondary cursor-pointer mb-4 [&_input]:w-4 [&_input]:h-4 [&_input]:accent-accent [&_input]:cursor-pointer";

// Current-value display line (e.g. current username / email).
export const CURRENT_VALUE = "text-sm text-ink-secondary mb-4";

export const CURRENT_VALUE_STRONG = "font-medium text-ink";

// Action row(s) hosting submit / secondary buttons.
export const ACTION_ROW = "flex flex-wrap items-center gap-2.5 mt-6";

export const BTN_PRIMARY = `${pillBtn} ${pillBtnPrimary}`;

export const BTN_SECONDARY = pillBtn;

// ===== Prompts form =====

export const PROMPT_CARD = "py-6 border-t border-hairline first:border-t-0";

export const PROMPT_CARD_HEADER =
  "flex flex-wrap items-center justify-between gap-3 mb-1";

export const PROMPT_CARD_NAME =
  "text-[15px] font-semibold tracking-tight text-ink flex items-center gap-2";

export const PROMPT_BADGE =
  "text-[10px] font-medium text-accent-ink bg-accent-surface px-2 py-0.5 rounded-pill";

export const PROMPT_CARD_DESC = "text-xs text-ink-tertiary mb-3.5";

export const PROMPT_DETAILS = "mb-3.5 border-t border-b border-hairline";

export const PROMPT_SUMMARY =
  "cursor-pointer py-2.5 text-xs text-ink-secondary select-none";

export const PROMPT_PRE =
  "py-1 pb-3.5 font-mono text-mono text-ink-secondary leading-relaxed whitespace-pre-wrap";

export const PROMPT_META = "block text-xs text-ink-tertiary mt-2";

export const PROMPT_ACTION_ROW = "flex flex-wrap items-center gap-2.5 mt-3.5";
