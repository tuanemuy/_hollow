/**
 * Shared Tailwind utility-class constants for note components.
 *
 * These are plain string constants (not `@apply` CSS rules) — Tailwind
 * JIT still sees the static utility tokens, so the bundle stays the same
 * as inline strings while authoring stays terse. Adopted under Issue
 * #70's utility-first migration as a practical concession to repetition;
 * see `.issue/70/adr.md` (ADR-002) for the broader policy.
 */

/** Pill button base — apply to every variant. */
export const pillBtn =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-surface text-sm font-medium text-ink whitespace-nowrap transition-colors hover:bg-surface-hover active:bg-surface-hover disabled:opacity-55 disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:cursor-not-allowed";

/** Append for primary pill button — drives "data-primary" variant. */
export const pillBtnPrimary =
  "data-[primary]:bg-accent data-[primary]:text-white data-[primary]:hover:bg-accent-hover data-[primary]:active:bg-accent-pressed";

/** Pill button — danger variant (used directly via className, not via state). */
export const pillBtnDanger = `${pillBtn} bg-error-surface text-error hover:bg-error-surface`;

/** Field wrapper. */
export const field = "flex flex-col gap-2 mb-4";

/** Field label. */
export const fieldLabel = "text-[13px] font-medium text-ink-secondary";

/** Field input/textarea/select base. */
export const fieldControl =
  "w-full rounded-md border border-transparent bg-surface px-3 py-[10px] text-sm text-ink outline-none transition-colors focus:border-accent focus:bg-bg disabled:opacity-55 disabled:cursor-not-allowed";

/** Field textarea modifier. */
export const fieldTextarea = "font-mono text-mono min-h-[320px] resize-y";

/** Form error message (inline). */
export const formError = "text-error text-[13px] mt-2";

/** Chip base. */
export const chip =
  "inline-flex items-center gap-[5px] h-7 px-3 rounded-pill bg-surface text-xs text-ink";

/** Modal dialog backdrop. */
export const dialogBackdrop =
  "fixed inset-0 z-[100] bg-black/35 flex items-center justify-center p-4";

/** Modal dialog body. */
export const dialog =
  "bg-bg rounded-lg p-6 max-w-[480px] w-full max-h-[90vh] overflow-y-auto shadow-lg";

/** Modal dialog title. */
export const dialogTitle = "text-lg font-medium mb-4";

/** Modal dialog actions row. */
export const dialogActions = "inline-flex gap-2 mt-4 justify-end w-full";

/** Radio/checkbox row. */
export const radioRow =
  "flex items-center gap-2 py-1 text-sm cursor-pointer [&_input]:accent-accent";

/** Checkbox row. */
export const checkboxRow =
  "flex items-start gap-3 text-sm text-ink-secondary leading-normal cursor-pointer [&_input]:w-4 [&_input]:h-4 [&_input]:mt-[2px] [&_input]:accent-accent [&_input]:cursor-pointer [&_input]:shrink-0";
