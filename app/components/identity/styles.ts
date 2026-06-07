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
  pillBtnGhostDanger,
  pillBtnPrimary,
  pillBtnSm,
} from "../common/styles";

// ===== Settings sidebar back link ("すべてのノートに戻る") =====
// Sits above the settings nav; mirrors the mock `.sidebar-back` using only
// token-derived utilities (no literal px).
export const SIDEBAR_BACK =
  "flex items-center gap-2 px-3 py-1.5 mb-5 rounded-md text-sm text-ink-secondary transition-colors motion-reduce:transition-none hover:bg-surface hover:text-ink";

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

// Inline help / hint line beneath a field (mock `.field-help`). Mirrors
// `auth/styles.ts` `FIELD_HINT` (token-derived `text-xs`, no literal px).
export const FIELD_HINT = "text-xs text-ink-tertiary mt-2";

// Character counter beneath a textarea (mock `.char-counter`).
export const CHAR_COUNTER = "text-xs text-ink-tertiary text-right mt-1";

// Input group framing an input with a static prefix (mock username `.prefix`).
export const INPUT_GROUP =
  "flex items-stretch bg-surface rounded-md border border-transparent overflow-hidden focus-within:bg-bg focus-within:border-accent transition-colors motion-reduce:transition-none";

export const INPUT_GROUP_PREFIX =
  "flex items-center px-3 text-sm text-ink-tertiary bg-surface-hover whitespace-nowrap select-none";

// Input rendered inside `INPUT_GROUP` — transparent so the group frame shows.
export const INPUT_GROUP_INPUT =
  "flex-1 min-w-0 h-10 bg-transparent border-0 px-3 py-2.5 text-sm text-ink outline-none";

// Live preview of the resulting public URL beneath the username input.
export const URL_PREVIEW =
  "text-xs text-ink-secondary mt-2 [overflow-wrap:anywhere]";

// Inline label + checkbox row (e.g. "他の端末からはログアウトする").
export const CHECKBOX_ROW =
  "flex items-center gap-2 text-sm text-ink-secondary cursor-pointer mb-4 [&_input]:w-4 [&_input]:h-4 [&_input]:accent-accent [&_input]:cursor-pointer";

// Current-value display line (e.g. current username / email).
export const CURRENT_VALUE = "text-sm text-ink-secondary mb-4";

export const CURRENT_VALUE_STRONG = "font-medium text-ink";

// Action row(s) hosting submit / secondary buttons.
export const ACTION_ROW = "flex flex-wrap items-center gap-2.5 mt-6";

// Spacer inside ACTION_ROW (mock `.action-row .spacer`) — pushes the trailing
// "最終保存" hint to the far end.
export const ACTION_ROW_SPACER = "flex-1";

export const BTN_PRIMARY = `${pillBtn} ${pillBtnPrimary}`;

export const BTN_SECONDARY = pillBtn;

// ===== Avatar block (mock `.avatar-row` / `.avatar-large` / `.avatar-actions`) =====

// Avatar + actions row. Stacks vertically below `sm` (mock max-width:640px rule).
export const AVATAR_ROW =
  "flex items-center gap-5 mb-6 max-sm:flex-col max-sm:items-start max-sm:gap-3";

// 80px circular avatar. Image fills via `object-cover`; the gradient + centered
// text serve as the initials fallback (mock `.avatar-large`, mirrors
// `layout/styles.ts` AVATAR at a larger size).
export const AVATAR_LARGE =
  "w-20 h-20 rounded-full bg-gradient-to-br from-[#c9d3df] to-[#8e99a8] text-white text-2xl font-light inline-flex items-center justify-center shrink-0 overflow-hidden";

// The `<img>` rendered inside AVATAR_LARGE when an avatar is set.
export const AVATAR_IMG = "w-full h-full object-cover";

export const AVATAR_ACTIONS = "flex flex-wrap gap-2";

// Small pill action button (mock `.btn-sm`) — surface chip at the `pillBtnSm`
// size. Drives `data-sm`.
export const BTN_SM = `${pillBtn} ${pillBtnSm}`;

// Small destructive (ghost) action button (mock `.btn-sm.danger-text`).
// Transparent at rest, error-surface on hover. Drives `data-ghost-danger data-sm`.
export const BTN_SM_DANGER = `${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}`;

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
