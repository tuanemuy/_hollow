/**
 * Tailwind utility-class constants for the saved-views list (P20).
 *
 * Plain string constants (not `@apply`) — Tailwind JIT scans the literals,
 * so the bundle is identical to inline strings while JSX stays terse. See
 * `.issue/70/adr.md` (ADR-002) for the utility-first hoisting policy and
 * `spec/design/pages/P20-views.html` for the source design.
 */

import {
  dateRangePresetLabels,
  formatDateRangeChipLabel,
  matchDateRangePreset,
} from "@/components/note/list/listSelectors";
import { visibilityLabel } from "@/components/note/list/styles";
import type { SavedViewDTO } from "@/core/application/dto/view";

/**
 * Japanese label for a saved view's sort, e.g. `更新降順` (P20 `.view-chips`'s
 * `ソート: …` chip). No shared helper exists for `{by, direction}`, so this
 * small lookup table is local to P20. `title` has no dedicated mock chip but
 * is part of the DTO union, so it is covered for completeness.
 */
const SORT_BY_LABEL: Record<SavedViewDTO["sort"]["by"], string> = {
  updatedAt: "更新",
  createdAt: "作成",
  title: "タイトル",
};

const SORT_DIRECTION_LABEL: Record<SavedViewDTO["sort"]["direction"], string> =
  {
    desc: "降順",
    asc: "昇順",
  };

export function sortChipLabel(sort: SavedViewDTO["sort"]): string {
  return `ソート: ${SORT_BY_LABEL[sort.by]}${SORT_DIRECTION_LABEL[sort.direction]}`;
}

/**
 * `公開状態: …` chip label for a saved view's visibility filter. Reuses the
 * note-list `visibilityLabel` SSOT. When multiple values are selected they are
 * joined with `・`; an empty filter yields `null` (no chip).
 */
export function visibilityChipLabel(
  filter: SavedViewDTO["query"]["visibilityFilter"],
): string | null {
  if (filter.length === 0) return null;
  return `公開状態: ${filter.map((v) => visibilityLabel(v)).join("・")}`;
}

/**
 * `更新: …` chip label for a saved view's date range. The DTO stores ISO
 * datetimes; the FilterBar preset helpers operate on `YYYY-MM-DD`, so the
 * bounds are sliced to date-only first. A preset match (e.g. `過去30日`) wins;
 * otherwise it falls back to the compact `M/D–M/D` form. `baseDate` is injected
 * so the preset arithmetic stays deterministic. Returns `null` when neither
 * bound is set (no chip).
 */
export function dateRangeChipLabel(
  range: SavedViewDTO["query"]["dateRange"],
  baseDate: Date,
): string | null {
  if (range === null) return null;
  const from = range.from === null ? undefined : range.from.slice(0, 10);
  const to = range.to === null ? undefined : range.to.slice(0, 10);
  const preset = matchDateRangePreset(from, to, baseDate);
  if (preset !== null) return `更新: ${dateRangePresetLabels[preset]}`;
  const compact = formatDateRangeChipLabel(from, to);
  return compact === null ? null : `更新: ${compact}`;
}

/**
 * `ディレクトリ: …` chip label. Resolves `directoryId` to a human path via the
 * supplied resolver (the flat directory list keyed by id); falls back to the
 * generic `ディレクトリ` when the id cannot be resolved. Returns `null` when no
 * directory is pinned (no chip).
 */
export function directoryChipLabel(
  directoryId: string | null,
  resolveName: (id: string) => string | undefined,
): string | null {
  if (directoryId === null) return null;
  const name = resolveName(directoryId);
  return name !== undefined ? `ディレクトリ: ${name}` : "ディレクトリ";
}

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
 * Row action cluster. P20 `.row-actions` = 適用(主) + ⋯ overflow menu(副).
 * Spans the full width and wraps below `lg`, mirroring P20's
 * `.row-actions { grid-column: 1 / -1; flex-wrap: wrap }`. `<Menu>` provides
 * the popover positioning context internally (`relative`), so this row only
 * lays out the apply pill + the trigger button side by side.
 */
export const rowActions =
  "inline-flex items-center gap-2 max-lg:col-span-full max-lg:flex-wrap";

/**
 * "適用" pill (P20 `.apply-btn`). Surface pill that warms to accent-surface on
 * hover, mirroring the primary row action. Height is implicit (`py-1.5` +
 * `text-sm` ≈ the mock's 30px) so no literal px is introduced; used for the
 * `<Link>` apply action.
 */
export const applyBtn =
  "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-pill bg-surface text-sm font-medium text-accent-ink transition-colors motion-reduce:transition-none hover:not-aria-disabled:bg-accent-surface aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed max-sm:min-h-[44px]";

/**
 * "⋯" overflow trigger (P20 `.row-menu-btn`). Circular icon button that fills
 * with surface on hover. `w-8 h-8` (32px) is the nearest token to the mock's
 * 30px; the `max-sm:min-w/h-[44px]` floor matches the codebase touch-target
 * convention. Pairs with the shared `<Menu>` primitive's panel.
 */
export const menuBtn =
  "inline-flex items-center justify-center w-8 h-8 rounded-pill text-ink-secondary transition-colors motion-reduce:transition-none hover:not-disabled:bg-surface-hover hover:not-disabled:text-ink disabled:opacity-disabled disabled:cursor-not-allowed max-sm:min-w-[44px] max-sm:min-h-[44px]";

/** Text action button / link base (inline rename editor save/cancel). */
export const textAction =
  "inline-flex items-center px-3 py-1.5 rounded-sm text-sm font-medium text-ink-secondary bg-transparent transition-colors motion-reduce:transition-none hover:not-disabled:not-aria-disabled:bg-surface-hover hover:not-disabled:not-aria-disabled:text-ink disabled:opacity-disabled disabled:cursor-not-allowed max-sm:min-h-[44px]";

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
