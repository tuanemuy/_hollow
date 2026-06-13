/**
 * SSR-safe localStorage wrapper for the home note-list display mode
 * (Issue #650 ADR-001).
 *
 * WHY localStorage: `display` is a pure client-render concern that never
 * reaches a usecase (#219), so the "last chosen mode" is persisted on the
 * device rather than in a cookie (which would couple `display` to the
 * server) or in a user-settings domain (overkill for a per-device
 * preference). See ADR-001 for the full rationale.
 *
 * WHY the guards: `localStorage` is unavailable during SSR (`window`
 * undefined) and can THROW on access in private-browsing / storage-disabled
 * environments. Every access is wrapped so a failure degrades to the
 * default `"list"` instead of crashing the render.
 *
 * Placement: home-route only for now (`DisplayModeSwitch` / `NoteListViews`
 * hard-code `getRouteApi("/_app/")`), so this lives under `note/list/`.
 * Revisit the location (e.g. promotion to `app/lib/`) when the preference
 * is reused on P30 / the public listing.
 */

import { DISPLAY_MODES, type DisplayMode } from "../constants";

const DISPLAY_PREFERENCE_KEY = "hollow3:noteList:display";

function isDisplayMode(value: string | null): value is DisplayMode {
  return value !== null && (DISPLAY_MODES as readonly string[]).includes(value);
}

/**
 * Read the persisted display mode. Returns `undefined` during SSR, when
 * storage access throws, or when the stored value is missing / not a
 * recognised `DisplayMode` — callers fall back to the default `"list"`.
 */
export function readDisplayPreference(): DisplayMode | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(DISPLAY_PREFERENCE_KEY);
    return isDisplayMode(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist the user-chosen display mode. No-op during SSR, when storage
 * access throws, or when `mode` is not a recognised `DisplayMode`.
 */
export function writeDisplayPreference(mode: DisplayMode): void {
  if (typeof window === "undefined") return;
  if (!(DISPLAY_MODES as readonly string[]).includes(mode)) return;
  try {
    window.localStorage.setItem(DISPLAY_PREFERENCE_KEY, mode);
  } catch {
    // Ignore: persistence is best-effort; a throwing localStorage must not
    // break the navigation that triggered the write.
  }
}
