/**
 * P14 (publish settings) specific Tailwind utility-class constants.
 *
 * Only domain-specific, repeated utility strings live here; generic
 * primitives (`field`/`fieldLabel`/`fieldControl`/`formError`/`pillBtn*`/
 * `chip`) are imported from `common/styles.ts` and the page/chip/empty-state
 * tokens from `layout/styles.ts`. Mirrors the per-domain `styles.ts` files
 * under `public`/`layout`/`auth`/`directory`. See `.issue/464/adr.md` ADR-001.
 */

/**
 * Visibility-status dot, colored by a `data-visibility` value-match variant
 * (CLAUDE.md state-style convention) rather than conditional class strings.
 *
 * Uses the same token vocabulary as `note/detail/NoteActions.tsx`'s
 * (module-private) `VISIBILITY_DOT`. The `unlisted` value maps to
 * `status-link` because the token is `--color-status-link` (there is no
 * `status-unlisted`). NoteActions is out of this issue's scope so the constant
 * is re-defined here rather than exported/imported; SSOT consolidation is a
 * follow-up (see `.issue/464/progress.md`).
 */
export const STATUS_DOT =
  "inline-block w-2 h-2 rounded-full data-[visibility=private]:bg-status-private data-[visibility=unlisted]:bg-status-link data-[visibility=public]:bg-status-public";

/**
 * Visibility radio as a selectable card. The accent emphasis is driven by
 * `has-[input:checked]:` (CSS `:has` follows the native radio's checked state)
 * rather than a React-state `data-selected`, so the card highlight tracks the
 * user's pre-submit click immediately. See `.issue/464/adr.md` ADR-004.
 *
 * `[&_input]:sr-only` visually hides the radio while keeping it operable and
 * keyboard-focusable; `focus-within:` restores a focus ring on the card.
 */
export const RADIO_CARD =
  "flex gap-3 p-3.5 rounded-lg border border-hairline cursor-pointer transition-colors motion-reduce:transition-none hover:border-hairline-strong hover:bg-surface-elevated has-[input:checked]:border-accent has-[input:checked]:bg-accent-surface focus-within:outline focus-within:outline-2 focus-within:outline-accent [&_input]:sr-only";

/** Radio-card title row (status dot + label). */
export const RADIO_CARD_TITLE =
  "flex items-center gap-2 text-md font-medium text-ink";

/** Section sub-heading (限定公開リンク). */
export const PUBLISH_SECTION_TITLE = "text-md font-medium text-ink";

/**
 * Link-row card for an issued share link. Truncation of the long URL is handled
 * by `LINK_URL` (`truncate`) inside a `min-w-0` flex row, not on this card.
 */
export const LINK_ROW =
  "flex flex-col gap-2 p-3.5 rounded-md border border-hairline";

/**
 * Monospace, ellipsis-truncated URL inside a link row.
 *
 * Uses `text-accent-ink` (not `text-ink`) to mirror the mock's `.link-text`
 * color, which is intentionally distinct from the issued-URL preview box
 * (`URL_PREVIEW_URL`, `text-ink` — mock's `.url-preview .url`). The two are
 * different surfaces in the design, hence the deliberate color split.
 */
export const LINK_URL =
  "block min-w-0 truncate font-mono text-xs text-accent-ink";

/**
 * Issued-URL preview box (shown once, right after issuing a link). Mirrors the
 * mock's `.url-preview` surface card with a monospace, wrappable URL.
 */
export const URL_PREVIEW = "bg-surface rounded-md p-3.5";

export const URL_PREVIEW_LABEL =
  "text-xs text-ink-tertiary uppercase tracking-[0.06em] font-medium mb-1";

/** Preview-box URL uses `text-ink` per the mock's `.url-preview .url` (see `LINK_URL`). */
export const URL_PREVIEW_URL = "font-mono text-sm text-ink break-all";
