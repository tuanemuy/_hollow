/**
 * Presentational inline spinner.
 *
 * A restrained spinning ring built from a `currentColor` border, so it inherits
 * the surrounding text color. The spin is guarded with `motion-safe:` so under
 * `prefers-reduced-motion: reduce` it renders without animation (spec/design
 * 「アニメーション」L93); the ring then switches to a dashed border so the
 * static glyph still reads as "in progress" rather than a plain circle.
 *
 * Use sparingly. Per spec/design (L92) skeletons are preferred over spinners
 * for load states; reach for `Spinner` only in small inline regions where a
 * skeleton would be excessive (e.g. inside a button while submitting). For
 * larger load states use {@link Skeleton}.
 */

const SIZE = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
} as const;

export function Spinner({
  size = "sm",
  ariaLabel = "読み込み中",
  decorative = false,
  className,
}: Readonly<{
  size?: "sm" | "md";
  ariaLabel?: string;
  /**
   * Renders the spinner as a purely visual glyph (`aria-hidden`, no
   * `role="status"`). Use when an enclosing live region (e.g. a
   * `role="alert"` panel) already announces the pending state, so the
   * spinner does not add a second announcement.
   */
  decorative?: boolean;
  className?: string;
}>) {
  const base = `inline-block ${SIZE[size]} border-2 border-current border-t-transparent rounded-full motion-safe:animate-spin motion-reduce:border-dashed`;
  const cls = className ? `${base} ${className}` : base;
  if (decorative) {
    return <span aria-hidden="true" className={cls} />;
  }
  return <span role="status" aria-label={ariaLabel} className={cls} />;
}
