/**
 * Suspense fallback archetype for list / management pages (mock
 * `P18-tags-skeleton.html`). Renders a small count bar plus a few list rows
 * (name + meta line on the left, action pills on the right). Static page
 * chrome (h1, create form, toolbar) stays outside the boundary; only the
 * data-dependent list region is replaced by this skeleton.
 */

const BAR = "bg-surface rounded-md motion-safe:animate-pulse";
const PILL = "bg-surface rounded-pill motion-safe:animate-pulse";

const ROW_WIDTHS = [
  ["w-[38%]", "w-[24%]"],
  ["w-[52%]", "w-[30%]"],
  ["w-[30%]", "w-[26%]"],
  ["w-[45%]", "w-[22%]"],
  ["w-[36%]", "w-[28%]"],
  ["w-[48%]", "w-[20%]"],
] as const;

export function ListPageSkeleton({
  rows = 4,
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
        <div className={`${BAR} h-3.5 w-24 mb-6`} />
        {Array.from({ length: rows }, (_, i) => {
          const [name, meta] = ROW_WIDTHS[i % ROW_WIDTHS.length] ?? [
            "w-[40%]",
            "w-[24%]",
          ];
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative rows with no identity
              key={i}
              className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-hairline py-4"
            >
              <div className="flex flex-col gap-2">
                <div className={`${BAR} h-3.5 ${name}`} />
                <div className={`${BAR} h-2.5 ${meta}`} />
              </div>
              <div className="inline-flex items-center gap-2 max-sm:hidden">
                <div className={`${PILL} h-8 w-16`} />
                <div className={`${PILL} h-8 w-16`} />
                <div className={`${PILL} h-8 w-[52px]`} />
              </div>
              <div className={`${PILL} h-8 w-9 sm:hidden`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
