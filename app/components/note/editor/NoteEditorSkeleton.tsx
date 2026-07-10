/**
 * Suspense fallback for the note editor (P12): topbar (mode tabs + save
 * actions), a large title bar, the directory pill, a tags row, the body
 * editor block and a couple of FrontMatter key/value rows. Approximates the
 * editor layout closely enough to avoid a jarring shift when the real editor
 * streams in.
 *
 * a11y mirrors `NoteDetailSkeleton`: a single announcing `role="status"`
 * region (`aria-live="polite"` + `aria-busy="true"`) wraps the visual
 * placeholders, which are themselves `aria-hidden`.
 */

import {
  SKELETON_BAR as BAR,
  SKELETON_PILL as PILL,
} from "@/components/common/styles";

const BODY_LINES: readonly string[] = [
  "w-full",
  "w-11/12",
  "w-full",
  "w-3/4",
  "w-5/6",
  "w-2/3",
] as const;

export function NoteEditorSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="エディタを読み込み中"
    >
      <div aria-hidden="true">
        {/* Topbar: mode tabs (left) + save / cancel actions (right). */}
        <div className="mb-4 flex items-center gap-3 flex-wrap max-sm:flex-col max-sm:items-stretch">
          <div className="inline-flex gap-1">
            <div className={`${PILL} h-8 w-20`} />
            <div className={`${PILL} h-8 w-20`} />
            <div className={`${PILL} h-8 w-20`} />
          </div>
          <div className="ml-auto inline-flex items-center gap-2">
            <div className={`${PILL} h-10 w-16`} />
            <div className={`${PILL} h-10 w-24`} />
          </div>
        </div>

        {/* Title. */}
        <div className={`${BAR} h-9 w-[60%] mb-5`} />

        {/* Directory pill row. */}
        <div className={`${PILL} h-[30px] w-40 mb-3`} />

        {/* Tags row. */}
        <div className="flex items-center gap-1.5 mb-5">
          <div className={`${PILL} h-[26px] w-16`} />
          <div className={`${PILL} h-[26px] w-20`} />
          <div className={`${PILL} h-[26px] w-14`} />
        </div>

        {/* Body editor block. */}
        <div className="rounded-md border border-hairline p-4 mb-6">
          <div className="flex flex-col gap-2.5">
            {BODY_LINES.map((w, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative bars with no identity
                key={i}
                className={`${BAR} h-3.5 ${w}`}
              />
            ))}
          </div>
        </div>

        {/* FrontMatter key/value rows. */}
        <div className={`${BAR} h-3 w-24 mb-3`} />
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-2 mb-3 max-sm:flex-col">
            <div className={`${BAR} h-8 w-1/3 max-sm:w-full`} />
            <div className={`${BAR} h-8 flex-1`} />
          </div>
        ))}
      </div>
    </div>
  );
}
