// Shared utility class strings for the settings (identity) surface. Mirrors
// `auth/styles.ts`: composes the domain-agnostic primitives from
// `common/styles.ts` and keeps styles inline (no @apply). `/settings` now lives
// under `/_app` and inherits the shared app shell (common Header + `APP_MAIN`
// frame) and the shared sidebar tokens from `layout/styles.ts`, so only the
// settings-specific form / error styles live here.

import {
  field,
  fieldControl,
  fieldLabel,
  fieldTextarea,
  formError,
  pillBtn,
  pillBtnPrimary,
} from "../common/styles";

// ===== Layout (settings errorComponent) =====
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
