/**
 * Presentational loading-skeleton primitives.
 *
 * Mirrors the design mock `P13a-upload-modal.html` `.skeleton` /
 * `.skeleton-bar` / `.skeleton-text` / `.skeleton-sub` pattern with
 * utility-first classes: surface-colored rounded bars with a subtle pulse.
 * The pulse is guarded with `motion-safe:` so `prefers-reduced-motion: reduce`
 * shows a static placeholder (spec/design「アニメーション」L93).
 *
 * These components are deliberately presentational — they return placeholder
 * DOM only and hold no loading logic. They are the intended `<Suspense>`
 * fallback building block (introduced separately in #634 Phase 2). Per
 * spec/design, prefer skeletons over spinners for load states.
 */

const SKELETON_BAR = "h-3 bg-surface rounded-md motion-safe:animate-pulse";

/**
 * A single skeleton bar. Width defaults to `w-full`; override it (and any
 * other layout) via `className`. Decorative — marked `aria-hidden`; the
 * surrounding `Skeleton` owns the `role="status"` announcement.
 */
export function SkeletonBar({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      aria-hidden="true"
      className={className ? `${SKELETON_BAR} ${className}` : SKELETON_BAR}
    />
  );
}

/**
 * A status region that stacks one or more `SkeletonBar`s with optional
 * caption text. Owns the single `role="status"` + `aria-live="polite"`
 * announcement (default label「読み込み中」) so screen readers get one
 * non-redundant notification while the decorative bars stay `aria-hidden`.
 *
 * `bars` selects the bar layout: a number renders that many full-width bars,
 * or pass an array of width utility strings (e.g. `["w-3/4", "w-1/2"]`) to
 * vary the widths. `label` / `sublabel` render secondary / tertiary ink
 * caption lines below the bars.
 */
export function Skeleton({
  bars = 3,
  label,
  sublabel,
  ariaLabel = "読み込み中",
  align = "stretch",
  className,
}: Readonly<{
  bars?: number | readonly string[];
  label?: string;
  sublabel?: string;
  ariaLabel?: string;
  align?: "stretch" | "center";
  className?: string;
}>) {
  const widths =
    typeof bars === "number"
      ? Array.from({ length: bars }, () => "w-full")
      : bars;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={className}
    >
      <div
        className={
          align === "center"
            ? "flex flex-col gap-2 items-center"
            : "flex flex-col gap-2"
        }
      >
        {widths.map((w, i) => (
          <SkeletonBar
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative bars with no identity
            key={i}
            className={align === "center" ? `${w} mx-auto` : w}
          />
        ))}
      </div>
      {label ? (
        <p className="mt-4 text-sm text-ink-secondary">{label}</p>
      ) : null}
      {sublabel ? (
        <p className="mt-1 text-xs text-ink-tertiary">{sublabel}</p>
      ) : null}
    </div>
  );
}
