/**
 * Shared constants for note-related UI / server-fn boundary code.
 *
 * Magic values lifted out of inline literals so that bulk limits, lock
 * TTLs and autosave timings can be tuned in one place. Values are
 * coupled to Cloudflare Workers CPU constraints (`BULK_NOTE_IDS_MAX`)
 * and to domain invariants (`EDIT_LOCK_TTL_SEC` ≤ `MAX_EDIT_LOCK_TTL_SECONDS`).
 */

export const DISPLAY_MODES = ["list", "tile", "calendar"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

/**
 * Issue #215: 1-based page index. Exported so loaders can re-default
 * `noteListSearchSchema.parse(...).page` (now optional after
 * `.default(...)` removal) without hard-coding `1`.
 */
export const NOTE_LIST_PAGE_DEFAULT = 1;

export const NOTE_LIST_LIMIT_DEFAULT = 20;
export const NOTE_LIST_LIMIT_MAX = 100;

/**
 * Upper bound for `noteIds` arrays in bulk usecases (`bulkMoveNotes`,
 * `bulkTrashNotes`, `bulkChangePublicationVisibility`). Sequential
 * per-note processing means larger batches risk Workers CPU exhaustion.
 */
export const BULK_NOTE_IDS_MAX = 100;

/**
 * Same shape as `BULK_NOTE_IDS_MAX` but for the `enqueueExportJob`
 * (`scope: "multiple"`) path. Kept distinct so future tuning of either
 * usecase does not pull the other along.
 */
export const EXPORT_BULK_LIMIT = 100;

/** Debounce window before an editor flush triggers `saveNoteDraft`. */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * TTL passed to `acquireEditLock` / `extendEditLock`. The value is
 * server-side fixed (never accepted from the client) so a buggy or
 * malicious caller cannot exceed `MAX_EDIT_LOCK_TTL_SECONDS = 1800` in
 * the note domain.
 */
export const EDIT_LOCK_TTL_SEC = 60;

/** Interval between `extendEditLock` calls — half of TTL for safety. */
export const EDIT_LOCK_RENEW_INTERVAL_MS = 30_000;
