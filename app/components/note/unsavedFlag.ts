/**
 * SSR-safe sessionStorage wrapper for a note's "has unsaved edits" flag
 * (Issue #583 ADR-001).
 *
 * The editor (`note/editor/NoteEditor`) and the publish modal
 * (`publication/PublishSettings`, reached via the detail route) live in
 * completely separate routes / RSC trees, so the editor's in-memory
 * `dirtyKeys` cannot reach the modal through React Context. This module is
 * the cross-route bridge: the editor writes the flag, the publish modal
 * reads it.
 *
 * WHY sessionStorage (not localStorage): an unsaved-edit flag is the
 * volatile fact "I edited this note in THIS tab/session but have not saved
 * yet". It must vanish when the tab closes. `localStorage` would persist it
 * across tabs and days, surfacing a stale "未保存の変更があります" warning on
 * a later visit. (`displayPreference` uses `localStorage` because a display
 * preference is a durable per-device choice — a different nature.)
 *
 * WHY this lives at `note/` (not `note/editor/`): writing is in `editor/`,
 * reading is in `publication/PublishSettings` — a 2-domain cross-cut.
 * Placing it under `editor/` would make publication import editor internals.
 * dirty is a per-note cross-cutting UI state, so it sits beside the other
 * shared `note/` modules (`actions.ts` / `constants.ts` / ...).
 *
 * dirty is a pure client UI concern and is never exposed to a usecase / DTO
 * (CLAUDE.md: the inside of a port stays deterministic and I/O-free).
 *
 * WHY the guards: `sessionStorage` is unavailable during SSR (`window`
 * undefined) and can THROW on access in private-browsing / storage-disabled
 * environments. Every access is wrapped so a failure degrades to "no
 * warning" (false) instead of crashing the render — best-effort.
 */

function keyFor(noteId: string): string {
  return `hollow3:note:${noteId}:dirty`;
}

/** Mark a note as having unsaved edits. No-op during SSR or on storage error. */
export function markNoteUnsaved(noteId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(keyFor(noteId), "1");
  } catch {
    // Ignore: persistence is best-effort; a throwing sessionStorage must not
    // break the edit flow that triggered the write.
  }
}

/** Clear a note's unsaved-edits flag. No-op during SSR or on storage error. */
export function clearNoteUnsaved(noteId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(keyFor(noteId));
  } catch {
    // Ignore: best-effort.
  }
}

/**
 * Read whether a note has unsaved edits. Returns `false` during SSR, when
 * storage access throws, or when the flag is missing — so callers fall back
 * to "no warning".
 */
export function readNoteUnsaved(noteId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(keyFor(noteId)) === "1";
  } catch {
    return false;
  }
}
