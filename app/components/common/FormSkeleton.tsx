/**
 * Suspense fallback archetype for form / settings pages (mock
 * `P21-settings-profile-skeleton.html`). Renders label-sized bars with
 * input-height rectangles plus an action-pill row. Static section titles /
 * descriptions stay outside the boundary; only the server-data value region
 * is replaced.
 */

const BAR = "bg-surface rounded-md motion-safe:animate-pulse";
const PILL = "bg-surface rounded-pill motion-safe:animate-pulse";

const FIELD_WIDTHS = ["w-3/5", "w-full", "w-3/5", "w-2/5"] as const;

export function FormSkeleton({
  fields = 3,
  ariaLabel = "読み込み中",
  className,
}: Readonly<{
  fields?: number;
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
      <div aria-hidden="true" className="flex flex-col gap-6">
        {Array.from({ length: fields }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative fields with no identity
            key={i}
            className="flex flex-col gap-2"
          >
            <div className={`${BAR} h-3 w-24`} />
            <div
              className={`${BAR} h-10 ${FIELD_WIDTHS[i % FIELD_WIDTHS.length]}`}
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <div className={`${PILL} h-9 w-20`} />
          <div className={`${PILL} h-9 w-24`} />
        </div>
      </div>
    </div>
  );
}
