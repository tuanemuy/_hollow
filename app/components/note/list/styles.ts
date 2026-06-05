// Shared utility class strings and visibility-chip helpers for the
// home / note-list views (ListView, TileView, FilterBar).

import type { OwnedNoteFilterItem } from "../loaders";

type Visibility = OwnedNoteFilterItem["visibility"];

export const CHIP_BASE =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill text-xs";

export function visibilityChipClass(v: Visibility): string {
  if (v === "public") return `${CHIP_BASE} bg-success-surface text-success`;
  if (v === "unlisted") return `${CHIP_BASE} bg-warning-surface text-warning`;
  return `${CHIP_BASE} bg-surface text-ink-tertiary`;
}

/**
 * Human label for a visibility value. Accepts the synthetic `"all"` option
 * used by the FilterBar's 公開状態 popover to represent "no filter / reset"
 * (#476); the applied-filter chip only ever passes a real `Visibility`.
 */
export function visibilityLabel(v: Visibility | "all"): string {
  if (v === "all") return "すべて";
  if (v === "public") return "公開";
  if (v === "unlisted") return "限定公開";
  return "非公開";
}

/**
 * Status swatch background color for a visibility option in the 公開状態
 * popover (Issue #476). Mirrors `visibilityChipClass`'s color family
 * (public=success / unlisted=warning / private・all=ink-tertiary) but as a
 * single `bg-*` token for the small dot rendered beside each option.
 */
export function visibilitySwatchClass(v: Visibility | "all"): string {
  if (v === "public") return "bg-success";
  if (v === "unlisted") return "bg-warning";
  return "bg-ink-tertiary";
}

/**
 * FilterBar chip vocabulary (Issue #476 案2). Every applied filter
 * (tag / 期間 / 公開状態 / directory / referencing note) renders with the
 * same "pill chip + ×" language so the chips stay visually identical; only
 * the trigger differs. The ghost trigger (`filterChipGhost`) is used by 期間 /
 * 公開状態 / 内部リンク参照 — each shows a dashed ghost chip when unset.
 * Directory has no in-bar trigger (it is set from the directory tree) and shows
 * just the active chip (#497 ADR-001).
 *
 * - `filterChip`: base pill. `data-[active]` flips it to the dark
 *   (ink / white) applied state, matching the existing tag-toggle look.
 * - `filterChipGhost`: dashed-outline unset trigger chip (期間 / 公開状態 /
 *   内部リンク参照 when no value is set). Transparent at rest, surface on hover.
 * - `filterChipRemove`: the inline `×` button inside an active chip.
 * - `filterChipCaret`: the `▾` affordance on a popover trigger chip.
 */
export const filterChip =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-surface text-sm text-ink transition-colors motion-reduce:transition-none hover:bg-surface-hover data-[active]:bg-ink data-[active]:text-white max-sm:min-h-[44px]";

export const filterChipGhost =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-transparent border border-dashed border-hairline-strong text-sm text-ink-secondary transition-colors motion-reduce:transition-none hover:bg-surface max-sm:min-h-[44px]";

export const filterChipRemove =
  "ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-white/85 hover:text-white hover:bg-white/[0.18]";

export const filterChipCaret = "ml-0.5 text-[10px] opacity-60";

/** Uppercase label used for the section headings inside the 期間 popover. */
export const filterLabel =
  "text-xs font-medium text-ink-tertiary uppercase tracking-[0.06em]";
