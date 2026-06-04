/**
 * Tailwind utility-class constants for the saved-views list (P20).
 *
 * Plain string constants (not `@apply`) — Tailwind JIT scans the literals,
 * so the bundle is identical to inline strings while JSX stays terse. See
 * `.issue/70/adr.md` (ADR-002) for the utility-first hoisting policy and
 * `spec/design/pages/P20-views.html` for the source design.
 */

/** List container — top hairline; each row carries its own bottom border. */
export const viewList = "border-t border-hairline";

/**
 * View row grid. Wide: `36px | 1fr | auto` with the actions column centered.
 * Below `lg` (<1024px) it collapses to a two-column / two-row layout and the
 * actions wrap onto a full-width third row (see `rowActions`).
 */
export const viewRow =
  "grid grid-cols-[36px_1fr_auto] gap-4 items-start px-3 py-5 border-b border-hairline transition-colors motion-reduce:transition-none hover:bg-surface [&>*:last-child]:self-center max-lg:grid-cols-[36px_1fr] max-lg:grid-rows-[auto_auto] max-lg:gap-3";

/** Square icon tile holding the display-mode glyph. */
export const viewIconWrap =
  "w-9 h-9 rounded-md bg-surface inline-flex items-center justify-center text-ink-secondary shrink-0";

/** Main column wrapper (name + chips + optional broken banner). */
export const viewMain = "min-w-0";

/** Header line: name plus default/public marks. */
export const viewHead = "flex items-center gap-2 mb-1.5 flex-wrap";

/** View name. */
export const viewName = "text-md font-medium text-ink tracking-tight";

/** "既定" badge (accent surface). */
export const defaultMark =
  "inline-flex items-center gap-1 text-xs font-medium text-accent-ink bg-accent-surface px-2 py-0.5 rounded-pill";

/** "公開" badge for `kind === "public"` (success surface). */
export const publicMark =
  "inline-flex items-center gap-1 text-xs font-medium text-status-public bg-success-surface px-2 py-0.5 rounded-pill";

/** Summary chip row. */
export const viewChips = "flex items-center gap-1.5 flex-wrap";

/** Broken-condition chip — warning surface variant of the shared `chip`. */
export const chipBroken = "bg-warning-surface text-warning";

/**
 * Row action cluster. Spans the full width and wraps below `lg`, mirroring
 * P20's `.row-actions { grid-column: 1 / -1; flex-wrap: wrap }`.
 */
export const rowActions =
  "inline-flex items-center gap-1 max-lg:col-span-full max-lg:flex-wrap";

/** Text action button / link base. */
export const textAction =
  "inline-flex items-center px-3 py-1.5 rounded-sm text-sm font-medium text-ink-secondary bg-transparent transition-colors motion-reduce:transition-none hover:not-disabled:not-aria-disabled:bg-surface-hover hover:not-disabled:not-aria-disabled:text-ink disabled:opacity-disabled disabled:cursor-not-allowed max-sm:min-h-[44px]";

/** Append for the "適用" action (accent coloring). */
export const textActionApply =
  "text-accent hover:not-disabled:not-aria-disabled:bg-accent-surface hover:not-disabled:not-aria-disabled:text-accent-ink";

/** Append for destructive actions (error coloring on hover). */
export const textActionDanger =
  "hover:not-disabled:not-aria-disabled:bg-error-surface hover:not-disabled:not-aria-disabled:text-error";

/** Broken-conditions warning banner (warning surface). */
export const brokenBanner =
  "flex items-start gap-3 px-4 py-3 bg-warning-surface rounded-md mt-3 mb-0.5 max-lg:flex-wrap";

/** Banner body wrapper. */
export const brokenBody = "flex-1 min-w-0";

/** Banner title. */
export const brokenTitle = "text-sm font-medium text-warning mb-0.5";

/** Banner detail text. */
export const brokenDetail = "text-sm text-warning/90 leading-snug";

/** Inline `<code>` for a deleted reference's name inside the banner. */
export const brokenCode =
  "font-mono text-[0.95em] bg-white/60 px-1.5 py-px rounded-xs";

/**
 * Banner "修復" action (P20 `.fix-btn`). Warning-toned, translucent-white
 * surface that brightens on hover; does not shrink when the banner wraps.
 */
export const fixBtn =
  "shrink-0 px-3 py-1.5 rounded-sm text-sm font-medium text-warning bg-white/60 transition-colors motion-reduce:transition-none hover:not-disabled:bg-white/95 disabled:opacity-disabled disabled:cursor-not-allowed max-sm:min-h-[44px]";

/** Inline editing name input. */
export const renameInput =
  "h-9 w-full max-w-xs rounded-md border border-transparent bg-surface px-3 text-sm text-ink outline-none transition-colors motion-reduce:transition-none focus:border-accent focus:bg-bg aria-invalid:border-error disabled:opacity-disabled disabled:cursor-not-allowed";

/** Inline form error / general error message. */
export const rowError = "text-error text-sm mt-2";

/** Empty-state message. */
export const emptyState = "px-3 py-12 text-center text-ink-secondary text-sm";
