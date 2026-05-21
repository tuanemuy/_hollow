// Shared utility class strings for the auth surface. Avoids re-typing the same
// utility lists in every auth form while keeping styles inline (no @apply).

export const AUTH_TITLE =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-2";

export const AUTH_SUBTITLE = "text-sm text-ink-secondary mb-8 leading-normal";

export const AUTH_BODY = "text-md text-ink-secondary leading-relaxed mb-8";

export const AUTH_FOOTER = "mt-8 text-center text-sm text-ink-secondary";

export const AUTH_FOOTER_LINK =
  "text-accent hover:underline hover:[text-underline-offset:3px]";

export const FORM = "flex flex-col gap-5";

export const FIELD = "flex flex-col gap-2";

export const FIELD_LABEL_ROW = "flex items-baseline justify-between gap-3";

export const FIELD_LABEL = "text-sm text-ink-secondary font-medium";

export const FIELD_OPTIONAL = "text-ink-tertiary font-normal ml-1";

export const FIELD_LINK =
  "text-sm text-accent hover:underline hover:[text-underline-offset:3px]";

export const FIELD_HINT = "text-xs text-ink-tertiary";

export const FIELD_HINT_ERROR = "text-xs text-error";

export const INPUT =
  "w-full h-11 border-0 bg-surface rounded-md px-4 text-md text-ink outline-none transition-colors motion-reduce:transition-none placeholder:text-ink-tertiary hover:bg-surface-hover focus-visible:bg-bg data-[error]:bg-error-surface data-[error]:shadow-[inset_0_0_0_1px_var(--color-error)] data-[error]:focus-visible:shadow-[inset_0_0_0_1px_var(--color-error),0_0_0_4px_oklch(37.1%_0_0_/_0.28)]";

export const INPUT_MONO = "font-mono";

export const INPUT_WITH_ACTION = "relative flex items-center";

export const REVEAL_BTN =
  "absolute right-1 w-9 h-9 inline-flex items-center justify-center text-ink-tertiary rounded-md transition-colors motion-reduce:transition-none hover:text-ink hover:bg-surface-hover";

export const CHECKBOX_ROW =
  "flex items-start gap-3 text-sm text-ink-secondary leading-normal cursor-pointer";

export const CHECKBOX_INPUT =
  "w-4 h-4 mt-0.5 accent-accent shrink-0 cursor-pointer";

export const FORM_ERROR =
  "flex gap-3 bg-error-surface text-error rounded-md px-4 py-3 text-sm leading-normal items-start";

export const BTN_PRIMARY =
  "w-full h-12 rounded-pill bg-accent text-white text-md font-medium inline-flex items-center justify-center transition-colors motion-reduce:transition-none hover:not-disabled:bg-accent-hover active:not-disabled:bg-accent-pressed disabled:opacity-60 disabled:cursor-not-allowed";

export const BTN_PRIMARY_INLINE =
  "h-12 min-w-[200px] px-8 rounded-pill bg-accent text-white text-md font-medium inline-flex items-center justify-center transition-colors motion-reduce:transition-none hover:not-disabled:bg-accent-hover active:not-disabled:bg-accent-pressed disabled:opacity-60 disabled:cursor-not-allowed";

export const BTN_SECONDARY =
  "inline-flex items-center justify-center h-11 px-6 rounded-pill bg-surface text-ink text-sm font-medium transition-colors motion-reduce:transition-none hover:not-disabled:bg-surface-hover disabled:opacity-60 disabled:cursor-not-allowed";

export const BTN_SECONDARY_TALL =
  "inline-flex items-center justify-center h-12 px-8 min-w-[200px] rounded-pill bg-surface text-ink text-md font-medium transition-colors motion-reduce:transition-none hover:not-disabled:bg-surface-hover disabled:opacity-60 disabled:cursor-not-allowed";

export const CALLOUT =
  "flex gap-3 px-4 py-3 rounded-md bg-surface text-ink-secondary text-sm leading-normal items-start mb-6";

export const CALLOUT_ICON = "text-accent shrink-0 mt-0.5 inline-flex";

export const CALLOUT_BODY = "flex flex-col gap-2";

export const CALLOUT_ACTION =
  "inline-flex items-center gap-1 text-accent font-medium text-sm self-start hover:underline hover:[text-underline-offset:3px] disabled:opacity-60";

export const NOTICE =
  "mt-6 p-4 rounded-lg bg-surface text-sm text-ink-secondary leading-relaxed";

export const ADMIN_EYEBROW =
  "inline-block text-xs text-accent font-medium uppercase tracking-[0.06em] mb-3";

export const STATUS_ICON =
  "w-[72px] h-[72px] mx-auto mb-6 rounded-full inline-flex items-center justify-center";

export const STATUS_ICON_SUCCESS = "bg-success-surface text-success";

export const STATUS_ICON_ERROR = "bg-error-surface text-error";
