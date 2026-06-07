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
 * wrapping row. Autosave / actions are pushed right via `ml-auto`.
 */
export const editorTopbar = "flex items-center gap-3 flex-wrap";
