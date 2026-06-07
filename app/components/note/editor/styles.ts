/**
 * Repeated utility strings for the note editor (P12).
 *
 * Hoisted module-scoped literals so Tailwind's JIT can scan them; behaviour
 * is identical to inline `className` strings (see CLAUDE.md styling rules).
 */

/**
 * P12 document-style title input: borderless, large, transparent. Focus
 * visualisation is intentionally left to the global `:focus-visible`
 * (`--shadow-focus`) — focus framing / spacing is out of scope here (#522).
 */
export const titleInput =
  "w-full bg-transparent border-0 outline-none text-3xl font-regular tracking-tightest leading-tight text-ink placeholder:text-ink-tertiary";

/**
 * P12 editor topbar: mode tabs + autosave status + primary actions in one
 * wrapping row. Mirrors the mock `.editor-topbar` order
 * (`mode-tabs → save-status → editor-actions`).
 */
export const editorTopbar = "flex items-center gap-3 flex-wrap";

/**
 * P12 editor actions group (save / cancel). `ml-auto` pushes only this group
 * to the right edge — matching the mock's `.editor-actions { margin-left: auto }`
 * — so save-status stays left, just after the mode tabs.
 */
export const editorActions = "ml-auto inline-flex items-center gap-2";
