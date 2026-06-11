/**
 * Presentational progress indicator.
 *
 * Mirrors the design mock `P13-upload.html` `.progress` / `.progress-bar`
 * (a surface-colored track with an accent fill) as utility-first classes.
 * Two modes:
 *
 *   - **indeterminate (default)** — no real progress value is available
 *     (e.g. the ingestion worker has no progress events; the P13 % values are
 *     static mock data). A partial-width accent segment pulses (opacity) to
 *     signal "in progress" — Tailwind's built-in `animate-pulse`, the same
 *     motion language as `Skeleton`, not a custom slide keyframe (#637 ADR-004
 *     dropped the slide to avoid adding `@keyframes`). The pulse is guarded
 *     with `motion-safe:` so under `prefers-reduced-motion: reduce` a static
 *     partial bar is shown instead (spec/design「アニメーション」L93). a11y:
 *     `role="progressbar"` + `aria-busy="true"` with **no** `aria-valuenow`
 *     (indeterminate).
 *   - **determinate** — pass `value` (0–100) when a real ratio is known
 *     (e.g. client-side sequential upload `n / total`). The fill width tracks
 *     the value and `aria-valuenow` is reported.
 *
 * The bar itself is the progress semantics; surrounding components should keep
 * any human-readable status in adjacent text so screen readers are not double
 * announced (the `aria-label` here names the bar, the text names the state).
 *
 * The indeterminate animation reuses Tailwind's built-in `animate-pulse`
 * (opacity) on a partial accent fill rather than a custom slide keyframe: per
 * #635 ADR-001 no new motion tokens / keyframes are added to `tokens.css` /
 * `index.css`, and a scoped `<style>` keyframe would trip
 * `lint/security/noDangerouslySetInnerHtml`. The pulse still reads as
 * "in progress"; under `prefers-reduced-motion: reduce` the same fill renders
 * statically (`motion-safe:` guards the pulse).
 */

const TRACK = "relative h-1.5 w-full overflow-hidden rounded-pill bg-surface";
const FILL = "absolute inset-y-0 rounded-pill bg-accent";

export function ProgressBar({
  value,
  ariaLabel = "処理中",
  decorative = false,
  className,
}: Readonly<{
  /** Real progress ratio 0–100. Omit for an indeterminate (pulsing) bar. */
  value?: number;
  ariaLabel?: string;
  /**
   * Render the bar as a purely visual glyph (`aria-hidden`, no
   * `role="progressbar"`). Use when an enclosing live region already
   * announces the in-progress state via adjacent text, so the bar does not
   * add a second announcement (e.g. the ingestion queue cards).
   */
  decorative?: boolean;
  className?: string;
}>) {
  const isDeterminate = value !== undefined;
  const clamped = isDeterminate ? Math.max(0, Math.min(100, value)) : undefined;

  return (
    <div
      {...(decorative
        ? { "aria-hidden": true }
        : {
            role: "progressbar",
            "aria-busy": !isDeterminate || clamped !== 100,
            "aria-label": ariaLabel,
            ...(isDeterminate
              ? {
                  "aria-valuenow": clamped,
                  "aria-valuemin": 0,
                  "aria-valuemax": 100,
                }
              : {}),
          })}
      className={className ? `${TRACK} ${className}` : TRACK}
    >
      {isDeterminate ? (
        <div
          className={`${FILL} left-0 transition-[width] duration-300 motion-reduce:transition-none`}
          style={{ width: `${clamped}%` }}
        />
      ) : (
        // Indeterminate: a partial accent fill that pulses (motion-safe) and
        // renders statically under reduced motion. Both read as "in progress".
        <div className={`${FILL} left-0 w-2/5 motion-safe:animate-pulse`} />
      )}
    </div>
  );
}
