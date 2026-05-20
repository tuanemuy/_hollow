/**
 * Shared Tailwind utility-class constants for tag components.
 *
 * Follows the same plain-string-constant pattern as
 * `note/styles.ts`, `auth/styles.ts`, `layout/styles.ts`, `public/styles.ts`
 * (see CLAUDE.md "Repeated utility strings can be hoisted").
 */

/** Indeterminate progress bar track — 同期処理中の不確定進捗用。 */
export const progressTrack =
  "relative h-1 w-full overflow-hidden rounded-pill bg-surface mt-3";

/** Indeterminate progress bar — animate-pulse でゆるく「動いている」を表現。 */
export const progressBarIndeterminate =
  "absolute inset-0 rounded-pill bg-accent/60 motion-safe:animate-pulse";
