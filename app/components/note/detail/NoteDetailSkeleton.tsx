/**
 * Suspense fallback for the note detail page (mock
 * `P11-note-detail-skeleton.html`): wide title bar + status chip,
 * prose-rhythm paragraph bars, a meta/property block and backlink cards.
 */

import {
  SKELETON_BAR as BAR,
  SKELETON_PILL as PILL,
} from "@/components/common/styles";

const PARAGRAPHS: readonly (readonly string[])[] = [
  ["w-full", "w-3/4", "w-full", "w-2/3"],
  ["w-full", "w-2/3", "w-full", "w-1/2"],
  ["w-3/4", "w-full", "w-2/3"],
] as const;

export function NoteDetailSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="ノートを読み込み中"
    >
      <div aria-hidden="true">
        <div className={`${BAR} h-8 w-[70%] mb-3`} />
        <div className={`${PILL} h-6 w-20 mb-8`} />

        {PARAGRAPHS.map((widths, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative paragraphs with no identity
            key={i}
            className="mb-6"
          >
            {i > 0 ? <div className={`${BAR} h-5 w-2/5 mb-4`} /> : null}
            <div className="flex flex-col gap-2.5">
              {widths.map((w, j) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative bars with no identity
                  key={j}
                  className={`${BAR} h-3.5 ${w}`}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-10 border-t border-hairline pt-6">
          <div className={`${BAR} h-3 w-24 mb-4`} />
          {["w-1/2", "w-1/2", "w-2/3"].map((w, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative rows with no identity
              key={i}
              className="grid grid-cols-[96px_1fr] items-center gap-4 py-2"
            >
              <div className={`${BAR} h-3 w-12`} />
              <div className={`${BAR} h-3 ${w}`} />
            </div>
          ))}
          <div className="grid grid-cols-[96px_1fr] items-center gap-4 py-2">
            <div className={`${BAR} h-3 w-12`} />
            <div className="flex items-center gap-2">
              <div className={`${PILL} h-6 w-16`} />
              <div className={`${PILL} h-6 w-[84px]`} />
              <div className={`${PILL} h-6 w-[72px]`} />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className={`${BAR} h-3 w-24 mb-4`} />
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-hairline px-4 py-4 mb-3"
            >
              <div className={`${BAR} h-2.5 w-1/2 mb-2`} />
              <div className={`${BAR} h-3.5 w-3/4 mb-2`} />
              <div className={`${BAR} h-3 w-full`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
