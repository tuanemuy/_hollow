/**
 * Suspense fallback archetype for admin table pages (mock
 * `P45-admin-users-skeleton.html`). Renders row placeholders shaped like a
 * table body: identity cell (avatar + two lines) plus pill / button cells.
 * Static chrome (h1, filters, table head) stays outside the boundary.
 */

import { SKELETON_BAR as BAR, SKELETON_PILL as PILL } from "./styles";

const ROW_WIDTHS = [
  ["w-[62%]", "w-[46%]"],
  ["w-[54%]", "w-[58%]"],
  ["w-[68%]", "w-[42%]"],
  ["w-[48%]", "w-[52%]"],
  ["w-[58%]", "w-[40%]"],
] as const;

export function AdminTableSkeleton({
  rows = 5,
  ariaLabel = "一覧を読み込み中",
  className,
}: Readonly<{
  rows?: number;
  ariaLabel?: string;
  className?: string;
}>) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      className={className}
    >
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => {
          const [line1, line2] = ROW_WIDTHS[i % ROW_WIDTHS.length] ?? [
            "w-[60%]",
            "w-[44%]",
          ];
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative rows with no identity
              key={i}
              className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_auto] items-center gap-4 border-b border-hairline py-3.5 max-sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`${BAR} h-9 w-9 shrink-0 rounded-full`} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className={`${BAR} h-3 ${line1}`} />
                  <div className={`${BAR} h-2.5 ${line2}`} />
                </div>
              </div>
              <div className={`${PILL} h-5 w-16 max-sm:hidden`} />
              <div className={`${PILL} h-5 w-[72px] max-sm:hidden`} />
              <div className="inline-flex items-center justify-end gap-2">
                <div className={`${PILL} h-8 w-16`} />
                <div className={`${PILL} h-8 w-[88px] max-sm:hidden`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
