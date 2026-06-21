/**
 * Tailwind utility-class constants for the export screens (P15 form / P16 job
 * list & detail). Plain string constants scanned by Tailwind's JIT (same
 * policy as `common/styles.ts`); the domain-specific repeating utility runs
 * live here so the three export components share one source. Domain-agnostic
 * primitives (pill buttons, alerts, tag badges, field rows) are reused from
 * `common/styles.ts` / `layout/styles.ts` and intentionally not redefined.
 */

import type { Tone } from "@/components/common/styles";

/**
 * Page `<main>` shell — centered column with the mock's responsive padding.
 * The two screens use different max-widths (P15 form = 720px, P16 list =
 * 1100px); both are mock-specific design values with no matching container
 * token (`--container-max` is 1280px), so the `max-w-[…px]` arbitraries are
 * allowed here. Padding mirrors the mock's
 * `var(--space-8) var(--space-6) var(--space-20)` base with `sm`/`lg`/`xl`
 * step-ups.
 */
const EXPORT_MAIN_BASE =
  "mx-auto w-full px-6 pt-8 pb-20 max-sm:px-4 max-sm:pt-6 max-sm:pb-20 lg:px-12 lg:pt-14 lg:pb-24 xl:px-16 xl:pt-16 xl:pb-28";

export const EXPORT_MAIN_FORM = `${EXPORT_MAIN_BASE} max-w-[720px]`;
export const EXPORT_MAIN_LIST = `${EXPORT_MAIN_BASE} max-w-[1100px]`;

/** Form section block (mock `.section`). */
export const SECTION = "mb-8";

/** Uppercase section label (mock `.section-label`). */
export const SECTION_LABEL =
  "block text-xs font-medium text-ink-secondary uppercase tracking-[0.06em] mb-2.5";

/**
 * Segmented control track (mock `.segmented`) — labeled white-card variant
 * for the format / paper-size pickers. Full-width `inline-flex` so the segments
 * share the row evenly. The note-list `DISPLAY_SEGMENTED` is the icon-only
 * sibling; this one carries text + a white active card.
 */
export const SEGMENTED = "bg-surface rounded-md p-0.5 inline-flex w-full";

/**
 * A segment button. Active state is driven by `data-active` (set as
 * `data-active={selected || undefined}`) so the white card + shadow only show
 * for the chosen value and there is no base/variant override-order contest.
 * The active shadow composes the `--shadow-xs` token with the mock's
 * extra 0.5px ring.
 *
 * The keyboard focus ring must read from the inner `sr-only` radio (the real
 * focus target — the `<label>` itself never receives tab focus), so the ring
 * is raised to this label via `has-[:focus-visible]:` rather than the label's
 * own `:focus-visible`. `has-[:focus-visible]:` (not `focus-within:`) keeps
 * the ring off on mouse click.
 */
export const SEGMENTED_BTN =
  "flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[7px] text-sm font-medium text-ink bg-transparent transition-colors motion-reduce:transition-none disabled:opacity-disabled disabled:cursor-not-allowed data-[active]:bg-bg data-[active]:shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent";

/**
 * Sticky-style action footer (mock `.form-footer`): top hairline, right-aligned
 * on desktop, full-width column-reverse stack below `sm` (cancel-less here:
 * the implementation has a single primary action). The right-side button group
 * mirrors the mock's `.right`.
 */
export const FORM_FOOTER =
  "flex flex-wrap items-center justify-end gap-2.5 mt-8 pt-5 border-t border-hairline max-sm:flex-col-reverse max-sm:items-stretch";

/** Status/success message shown beside the footer action. */
export const FORM_NOTE = "text-sm text-ink-secondary";

/* ── P16 list / detail ─────────────────────────────────────────────── */

/** Job-card list wrapper (mock mobile `.jobs-list`). */
export const JOBS_LIST = "flex flex-col gap-3";

/**
 * One job card (mock `.job-card`). Mobile baseline = bordered card; at `lg`
 * the meta/actions reflow to a horizontal row (card-list, not a 7-column
 * table).
 */
export const JOB_CARD =
  "flex flex-col gap-3 border border-hairline rounded-lg p-4 bg-bg";

/** Card head row — status chip + format pill (mock `.job-card-head`). */
export const JOB_CARD_HEAD = "flex items-start gap-3 flex-wrap";

/** Mono format pill (mock `.format-pill`). */
export const FORMAT_PILL =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-surface text-xs text-ink-secondary font-mono w-fit whitespace-nowrap";

/** Mono progress count cell (mock `.count-cell`). */
export const COUNT_CELL = "font-mono text-sm text-ink";

/** Status dot base (mock `.status .dot`). Color is appended per-tone. */
export const STATUS_DOT = "w-2 h-2 rounded-full shrink-0";

/**
 * Tone → dot background color. Derived from {@link exportStatusTag} so the dot
 * and the chip share one mapping. Four families only — the dot never needs a
 * 6-way `data-status` switch.
 */
export const STATUS_DOT_COLOR: Record<Tone, string> = {
  info: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

/** Progress track (mock `.progress`). */
export const PROGRESS =
  "h-1 w-full bg-surface rounded-pill overflow-hidden mt-1.5";

/**
 * Progress fill (mock `.progress-bar`). Width is data-driven and supplied via
 * inline `style` since Tailwind's JIT only scans static arbitraries.
 */
export const PROGRESS_BAR =
  "h-full bg-accent rounded-pill transition-[width] duration-300 motion-reduce:transition-none";

/**
 * Detail meta grid (mock mobile `.job-meta`). 2-column on mobile,
 * definition-list on desktop. The divider that the mock draws above the meta
 * (`.job-meta { border-top; padding-top }`) is intentionally NOT baked in here:
 * it only makes sense in the job-card list, where the meta sits below the card
 * head/progress. In the detail view this grid is the first child of its
 * `<section>` (directly under the page title), so a top hairline would float
 * with nothing above it. The list usage adds {@link JOB_META_DIVIDER}.
 */
export const JOB_META =
  "grid grid-cols-2 gap-3 lg:grid-cols-[auto_1fr] lg:gap-x-6 lg:items-baseline";

/** Top-divider + paired spacing for the meta grid inside a job-card (mock `.job-meta { border-top }`). */
export const JOB_META_DIVIDER = "pt-3 mt-1 border-t border-hairline";

/** Meta key (mock `.meta-k`). */
export const META_K =
  "text-xs text-ink-tertiary uppercase tracking-[0.05em] mb-0.5 lg:mb-0";

/** Meta value (mock `.meta-v`). */
export const META_V = "text-sm text-ink";

/** Card / detail action row (mock `.job-actions`). Full-width buttons below `sm`. */
export const JOB_ACTIONS =
  "flex flex-wrap items-center gap-2 pt-3 border-t border-hairline max-sm:[&_>_*]:flex-1 max-sm:[&_>_*]:justify-center";

/**
 * Failure summary box (mock `.fail-summary`). Error-surface chip with a 2-line
 * clamp; the full stack lives on the detail route.
 */
export const FAIL_SUMMARY =
  "text-xs text-error leading-snug bg-error-surface px-3 py-2 rounded-sm [overflow-wrap:anywhere]";
