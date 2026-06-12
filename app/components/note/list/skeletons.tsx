/**
 * Home-local Suspense fallbacks (mock `P10-home-skeleton.html`).
 *
 * The toolbar placeholder (heading + page-meta row, #626 ADR-004/007) is
 * decorative (`aria-hidden`, per the mock) so the page does not stack a
 * third "読み込み中" announcement on top of the filter and note-list status
 * regions — the loading announcements stay with `FilterBarSkeleton` and
 * `NoteListSkeleton` only.
 */

import {
  SKELETON_BAR as BAR,
  SKELETON_PILL as PILL,
} from "@/components/common/styles";
import { filterBar } from "./styles";

const FILTER_CHIP_WIDTHS = [
  "w-[88px]",
  "w-16",
  "w-[104px]",
  "w-[72px]",
  "w-14",
] as const;

const NOTE_ROW_WIDTHS = [
  ["w-[70%]", "w-[90%]"],
  ["w-[60%]", "w-[70%]"],
  ["w-[90%]", "w-[60%]"],
] as const;

export function ToolbarSkeleton() {
  return (
    <div aria-hidden="true">
      {/* 見出し（ビュー切り替えトリガー）。骨組みとしては1本のバーで表現
          （chevron まで描くと過剰 — skeleton モックの注記どおり）。 */}
      <div className="mb-3">
        <div className={`${BAR} h-[34px] w-[35%]`} />
      </div>
      {/* page-meta-row: 左 = 件数ライン / 右 = アイコンボタン×2 + segmented。
          CTA・保存ビュー select のプレースホルダは廃止（#626 ADR-002/004）。 */}
      <div className="flex justify-between items-center gap-3 flex-wrap mb-5">
        <div className={`${BAR} h-3 w-[110px]`} />
        <div className="inline-flex items-center gap-2">
          <div className={`${PILL} h-9 w-9`} />
          <div className={`${PILL} h-9 w-9`} />
          <div className={`${BAR} h-8 w-[104px] rounded-[9px]`} />
        </div>
      </div>
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="フィルタを読み込み中"
      className={filterBar}
    >
      <div aria-hidden="true" className="inline-flex gap-1.5 flex-wrap">
        {FILTER_CHIP_WIDTHS.map((w) => (
          <div key={w} className={`${PILL} h-7 ${w}`} />
        ))}
      </div>
    </div>
  );
}

export function NoteListSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="ノートを読み込み中"
    >
      <div aria-hidden="true">
        {NOTE_ROW_WIDTHS.map(([title, snippet]) => (
          <div
            key={title}
            className="flex items-start gap-3 border-b border-hairline py-4"
          >
            <div className={`${BAR} h-4 w-4 shrink-0 rounded`} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className={`${BAR} h-4 ${title}`} />
              <div className={`${BAR} h-3 ${snippet}`} />
              <div className="flex gap-1.5">
                <div className={`${PILL} h-5 w-16`} />
                <div className={`${PILL} h-5 w-12`} />
              </div>
            </div>
            <div className={`${BAR} h-3 w-16 shrink-0 max-sm:hidden`} />
          </div>
        ))}
      </div>
    </div>
  );
}
