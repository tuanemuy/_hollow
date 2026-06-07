/**
 * Shared Tailwind utility-class constants for tag components.
 *
 * Follows the same plain-string-constant pattern as
 * `common/styles.ts`, `auth/styles.ts`, `layout/styles.ts`, `public/styles.ts`
 * (see CLAUDE.md "Repeated utility strings can be hoisted").
 */

/** Indeterminate progress bar track — 同期処理中の不確定進捗用。 */
export const progressTrack =
  "relative h-1 w-full overflow-hidden rounded-pill bg-surface mt-3";

/** Indeterminate progress bar — animate-pulse でゆるく「動いている」を表現。 */
export const progressBarIndeterminate =
  "absolute inset-0 rounded-pill bg-accent/60 motion-safe:animate-pulse";

/**
 * Tag list row — the per-tag `<li>`. Mirrors `layout/styles.ts` DATA_ROW but
 * adds `group` so the row's `hover` / `focus-within` can reveal the otherwise
 * hidden action column (mock `.list-row` + `.list-row-actions-hover`).
 */
export const TAG_ROW =
  "group grid grid-cols-[1fr_auto] gap-4 px-3 py-4 border-t border-hairline items-center last-of-type:border-b";

/**
 * Hover/focus-revealed inline action column (mock `.list-row-actions-hover`).
 * Transparent until the row is hovered or holds focus; hidden entirely below
 * `lg`, where the kebab menu (`TAG_ROW_KEBAB_WRAP`) takes over (mock
 * `@media (max-width: 1023px)` — see `.issue/542/adr.md` ADR-003).
 */
export const TAG_ROW_ACTIONS =
  "inline-flex items-center gap-2 max-lg:hidden opacity-0 transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100";

/** Kebab menu column — hidden at `lg`+, shown below `lg` (inverse of TAG_ROW_ACTIONS). */
export const TAG_ROW_KEBAB_WRAP = "hidden max-lg:inline-flex";

/** Tag note-count line — hidden below `lg` (mock `.tag-count { display: none }`). */
export const TAG_COUNT = "text-sm text-ink-tertiary max-lg:hidden";

/**
 * Inline-rename editing block wrapper (mock `.tag-editing-block`). Paints the
 * accent-surface background on the whole editing area so the row beneath stays
 * borderless/transparent. Kept inside `TagActions` (TagActions-completed
 * wrapper) so the editing state never has to be lifted into `TagList` and thus
 * does not interfere with its `useOptimistic` projection — see ADR-004.
 */
export const TAG_EDITING_BLOCK =
  "-mx-3 -my-4 px-3 py-4 bg-accent-surface flex flex-col gap-1.5";

/** Context heading above the rename input (mock `.tag-editing-block .tag-count`). */
export const TAG_EDITING_HEADING = "text-sm text-ink-tertiary";

/** Inline rename input (mock `.rename-input` at the h-7 density). */
export const TAG_RENAME_INPUT =
  "h-7 px-2.5 bg-bg border border-hairline rounded-md text-sm text-ink outline-none transition-colors motion-reduce:transition-none min-w-[140px] hover:border-hairline-strong focus:border-accent";
