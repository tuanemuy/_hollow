// Shared utility class strings and visibility-chip helpers for the
// home / note-list views (ListView, TileView, FilterBar).

import type { OwnedNoteFilterItem } from "../loaders";

type Visibility = OwnedNoteFilterItem["visibility"];

export const CHIP_BASE =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill text-xs";

// P10 DisplayModeSwitch の segmented control（#626 ADR-001）。
// アイコンのみ・active は ink 濃度差（白カード + shadow は使わない）。
// ボタンはデスクトップ 32×28px / モバイル 36×32px。モバイルでは見た目寸法を保ったまま
// 擬似要素で当たり判定を 44px 相当へ拡張する（縦を優先し横は隣接ボタンと干渉しない範囲）。
export const DISPLAY_SEGMENTED = "bg-surface rounded-[9px] p-[2px] inline-flex";
export const DISPLAY_SEGMENTED_BTN =
  "relative w-8 h-7 max-sm:w-9 max-sm:h-8 rounded-[7px] bg-transparent inline-flex items-center justify-center text-ink-tertiary transition-all duration-[180ms] motion-reduce:transition-none hover:text-ink-secondary data-[active]:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent max-sm:after:absolute max-sm:after:content-[''] max-sm:after:-inset-y-1.5 max-sm:after:-inset-x-0.5";

// 選択 / ビューとして保存のアイコンのみボタン（#626 ADR-005）。
// `pillBtn + pillBtnGhost + pillBtnIcon` に重ねて、デスクトップのみ 36px 角へ縮める。
// 縮小方向だが responsive 変種（sm:）は基底ユーティリティより後にソートされるため勝つ。
// モバイルは pillBtnIcon の 44px 床がそのまま立つ。
export const TOOLBAR_ICON_BTN =
  "sm:h-9 sm:min-h-9 data-[icon]:sm:w-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

// チップ列末尾の「フィルタをすべてクリア」円形 ×（#626 ADR-006）。
// デスクトップ 28px / モバイル 32px。モバイルは擬似要素で当たり判定 44px 相当。
export const filterClearX =
  "relative inline-flex items-center justify-center w-7 h-7 max-sm:w-8 max-sm:h-8 rounded-full shrink-0 text-ink-tertiary transition-colors motion-reduce:transition-none hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent max-sm:after:absolute max-sm:after:content-[''] max-sm:after:-inset-y-1.5 max-sm:after:-inset-x-1.5";

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
 * Directory is the exception: when its id resolves to a path it renders as a
 * breadcrumb (`DirectoryBreadcrumb`) in the page header, above the heading,
 * since it reads as "current location" not a filter (#743 ADR-002, superseding
 * #497 ADR-001 / #710 ADR-002). What remains in this filter row is only the
 * fallback chip: `filterChip` is reused solely when the active directory id
 * cannot be resolved to breadcrumb segments.
 *
 * - `filterChip`: base pill. `data-[active]` flips it to the dark
 *   (ink / white) applied state, matching the existing tag-toggle look.
 * - `filterChipGhost`: dashed-outline unset trigger chip (期間 / 公開状態 /
 *   内部リンク参照 when no value is set). Transparent at rest, surface on hover.
 * - `filterChipRemove`: the inline `×` button inside an active chip.
 * - `filterChipCaret`: the `▾` affordance on a popover trigger chip.
 *
 * Height is 28px desktop / 32px mobile (`h-7 max-sm:h-8`) per the mocks, and the
 * 44px touch floor (`TOUCH_TARGET`) is intentionally NOT applied: the mock limits
 * the floor to pill/icon buttons so bare chips are not inflated above the
 * desktop look; the chip row is a horizontal scroller with its own spacing
 * (#749 ADR-001). 32px still meets WCAG 2.5.8.
 */
export const filterChip =
  "inline-flex items-center gap-1.5 h-7 max-sm:h-8 px-3 rounded-pill bg-surface text-sm text-ink whitespace-nowrap shrink-0 transition-colors motion-reduce:transition-none hover:bg-surface-hover data-[active]:bg-ink data-[active]:text-white";

export const filterChipGhost =
  "inline-flex items-center gap-1.5 h-7 max-sm:h-8 px-3 rounded-pill bg-transparent border border-dashed border-hairline-strong text-sm text-ink-secondary whitespace-nowrap shrink-0 transition-colors motion-reduce:transition-none hover:bg-surface";

export const filterChipRemove =
  "ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-white/85 hover:text-white hover:bg-white/[0.18]";

export const filterChipCaret = "ml-0.5 text-[10px] opacity-60";

/** Uppercase label used for the section headings inside the 期間 popover. */
export const filterLabel =
  "text-xs font-medium text-ink-tertiary uppercase tracking-[0.06em]";

/**
 * FilterBar desktop container. At `sm` and up it is the original wrapping flex
 * chip cloud; below `sm` it is hidden entirely (`max-sm:hidden`) because the
 * mobile filters move into the aggregated bottom sheet.
 *
 * #749 ADR-001 originally specified that this chip row is a horizontal scroller
 * (`flex-wrap: nowrap` + `overflow-x: auto`, scrollbar hidden) below `sm`.
 * #754 updates that decision: the horizontal-scroll dependency was a UX problem
 * (low discoverability / unreachable filters), so on mobile the inline chip row
 * is replaced by a "絞り込み" trigger that opens a `Dialog` bottom sheet
 * (#754 ADR-001 / ADR-002). The `min-w-0` lets the row shrink inside the grid
 * main column on desktop.
 */
export const filterBar =
  "flex flex-wrap items-center gap-3 mb-5 min-w-0 max-sm:hidden";

/**
 * Mobile-only aggregated filter trigger bar (`hidden max-sm:flex`). Holds the
 * "絞り込み" button (which opens the filter sheet) and, when filters are
 * applied, the global clear-× (#754 ADR-001). Hidden at `sm` and up where the
 * inline `filterBar` chip cloud takes over.
 */
export const mobileFilterBar = "hidden max-sm:flex items-center gap-2 mb-5";

/**
 * The mobile "絞り込み" trigger button. A pill-shaped chip-height control
 * carrying the filter glyph + label + applied-count badge. State is conveyed by
 * `aria-haspopup="dialog"` + `aria-expanded` only — intentionally NOT
 * `aria-pressed`/`aria-checked`, so it never enters the tag-toggle button set
 * the tests walk (#754 ADR-001, arch S-003).
 */
export const mobileFilterTrigger =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-surface text-sm text-ink whitespace-nowrap transition-colors motion-reduce:transition-none hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

/** Applied-filter count badge shown inside the mobile trigger. */
export const mobileFilterCount =
  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-ink text-[11px] font-medium text-white";

/** Section heading inside the mobile filter sheet. */
export const filterSheetSection = "flex flex-col gap-2.5 mb-6 last:mb-0";
