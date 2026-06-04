// Shared utility class strings and visibility-chip helpers for the
// home / note-list views (ListView, TileView).

import type { OwnedNoteFilterItem } from "../loaders";

type Visibility = OwnedNoteFilterItem["visibility"];

export const CHIP_BASE =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill text-xs";

export function visibilityChipClass(v: Visibility): string {
  if (v === "public") return `${CHIP_BASE} bg-success-surface text-success`;
  if (v === "unlisted") return `${CHIP_BASE} bg-warning-surface text-warning`;
  return `${CHIP_BASE} bg-surface text-ink-tertiary`;
}

export function visibilityLabel(v: Visibility): string {
  if (v === "public") return "公開";
  if (v === "unlisted") return "限定公開";
  return "非公開";
}
