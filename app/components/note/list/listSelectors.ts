/**
 * Pure logic for the home / note-list page.
 *
 * Everything in this module is React-agnostic so it can be tested in
 * isolation with vitest. The selection reducer, day grouping, date
 * formatting and URL <-> ViewQuery translators all live here; the React
 * components import the functions but never the other way round.
 */

import type { SavedViewDTO, ViewQueryDTO } from "@/core/application/dto/view";
import type { DisplayMode } from "../constants";
import type { NoteListSearch } from "../schema";

export type NoteId = string;

/**
 * Format an ISO timestamp into a localized `ja-JP` date label for the
 * note-list views. Falls back to the raw string for unparsable input.
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * `useSearch({ select })` helper for the home route.
 *
 * Shared by every client component that needs the URL-driven display
 * mode (Issue #219). Returning a literal value keeps `useSearch`'s
 * referential-equality check stable so subscribers do not re-render
 * unless the chosen mode actually changes.
 */
export const selectDisplay = (s: {
  display?: DisplayMode | undefined;
}): DisplayMode => s.display ?? "list";

/**
 * Pure predicate for the home-route SavedView URL normalisation
 * (Issue #219 ADR-002). The handler should redirect to `/` with
 * `display = view.displayMode` only when all three conditions hold:
 *
 * - `viewId` is present (we are restoring a SavedView)
 * - `display` is absent from the URL (the user has not overridden it)
 * - `view` was actually resolved (a deleted / foreign view falls back
 *   to the URL value rather than looping on a missing resource)
 *
 * Extracted as a pure function so the branch is regression-tested
 * without spinning up the server fn.
 */
export function shouldRedirectForSavedView(args: {
  search: { viewId?: string | undefined; display?: DisplayMode | undefined };
  view: { displayMode: DisplayMode } | null;
}): boolean {
  return (
    args.search.viewId !== undefined &&
    args.search.display === undefined &&
    args.view !== null
  );
}

export type SelectionState = Readonly<{
  ids: ReadonlySet<NoteId>;
  // Whether the explicit selection mode is active. Checkboxes and the
  // BulkActionBar are only shown while `mode` is true (Issue #354). The
  // flag is a purely client-side display concern, kept here alongside the
  // ids so "exit mode clears the selection" is a single atomic transition.
  mode: boolean;
}>;

export type SelectionAction =
  | Readonly<{ type: "toggle"; id: NoteId }>
  | Readonly<{ type: "selectMany"; ids: readonly NoteId[] }>
  | Readonly<{ type: "selectAll"; ids: readonly NoteId[] }>
  | Readonly<{ type: "clear" }>
  | Readonly<{ type: "enterSelectMode" }>
  | Readonly<{ type: "exitSelectMode" }>
  | Readonly<{ type: "toggleSelectMode" }>;

export const emptySelection: SelectionState = {
  ids: new Set<NoteId>(),
  mode: false,
};

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state.ids);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ids: next, mode: state.mode };
    }
    case "selectMany": {
      const next = new Set(state.ids);
      for (const id of action.ids) next.add(id);
      return { ids: next, mode: state.mode };
    }
    case "selectAll": {
      return { ids: new Set(action.ids), mode: state.mode };
    }
    case "clear": {
      if (state.ids.size === 0) return state;
      return { ids: new Set<NoteId>(), mode: state.mode };
    }
    case "enterSelectMode": {
      if (state.mode) return state;
      return { ids: state.ids, mode: true };
    }
    case "exitSelectMode": {
      // Leaving selection mode discards the pending selection so re-entering
      // starts clean.
      if (!state.mode && state.ids.size === 0) return state;
      return emptySelection;
    }
    case "toggleSelectMode": {
      return state.mode ? emptySelection : { ids: state.ids, mode: true };
    }
  }
}

/**
 * Bucket notes into ISO-date keys (`YYYY-MM-DD`) in the supplied
 * timezone. The order of the returned buckets mirrors the input order,
 * and within a bucket the order is preserved as well.
 *
 * `tz` is required because Workers' `Intl.DateTimeFormat` defaults to
 * UTC; the caller (a client component) resolves the browser timezone
 * with `Intl.DateTimeFormat().resolvedOptions().timeZone`.
 */
export function groupNotesByDay<T extends { id: string; updatedAt: string }>(
  notes: readonly T[],
  tz: string,
): ReadonlyArray<Readonly<{ dateKey: string; notes: readonly T[] }>> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const orderedKeys: string[] = [];
  const byKey = new Map<string, T[]>();
  for (const note of notes) {
    const date = new Date(note.updatedAt);
    const dateKey = Number.isNaN(date.getTime())
      ? "unknown"
      : formatter.format(date);
    const bucket = byKey.get(dateKey);
    if (bucket === undefined) {
      byKey.set(dateKey, [note]);
      orderedKeys.push(dateKey);
    } else {
      bucket.push(note);
    }
  }
  return orderedKeys.map((dateKey) => ({
    dateKey,
    notes: (byKey.get(dateKey) ?? []) as readonly T[],
  }));
}

export type SaveViewPayload = Readonly<{
  query: Readonly<{
    tagNames: readonly string[];
    directoryId: string | null;
    dateRange: Readonly<{
      from: string | null;
      to: string | null;
    }> | null;
    keyword: string | null;
    referencingNoteId: string | null;
    visibilityFilter: ReadonlyArray<"private" | "unlisted" | "public">;
  }>;
  displayMode: "list" | "tile" | "calendar";
}>;

/**
 * Translate the URL-driven search shape into the payload accepted by
 * `createSavedViewFn`. Tag names are passed through unchanged — the
 * server-fn handler resolves them to ids before calling the usecase.
 */
export function searchToViewQuery(search: NoteListSearch): SaveViewPayload {
  const hasFrom = search.from !== undefined;
  const hasTo = search.to !== undefined;
  const dateRange =
    hasFrom || hasTo
      ? {
          from: hasFrom ? (search.from as string) : null,
          to: hasTo ? (search.to as string) : null,
        }
      : null;
  return {
    query: {
      tagNames: search.tagNames ?? [],
      directoryId: search.directoryId ?? null,
      dateRange,
      keyword:
        search.q !== undefined && search.q.trim().length > 0 ? search.q : null,
      referencingNoteId: search.referencingNoteId ?? null,
      visibilityFilter:
        search.visibility !== undefined ? [search.visibility] : [],
    },
    displayMode: search.display ?? "list",
  };
}

/**
 * Expand a `SavedViewDTO` back into a URL-search-compatible object.
 * Returns only the fields the SavedView pins down; the caller merges
 * this with any explicit URL parameters so user-supplied overrides win.
 *
 * Note: `tagIds` cannot be reversed into `tagNames` without a name
 * dictionary (the SavedView snapshot stores ids only). The caller is
 * expected to resolve them via `loadAllTags.byId` if needed; this
 * function returns `undefined` for `tagNames` to make that responsibility
 * explicit.
 */
export function viewQueryToSearch(
  view: SavedViewDTO,
  resolveTagNames?: (tagIds: readonly string[]) => readonly string[],
): Partial<NoteListSearch> {
  const out: Partial<NoteListSearch> = {
    display: view.displayMode,
  };
  if (view.query.directoryId !== null) {
    out.directoryId = view.query.directoryId as unknown as string;
  }
  if (view.query.keyword !== null) {
    out.q = view.query.keyword;
  }
  if (view.query.referencingNoteId !== null) {
    out.referencingNoteId = view.query.referencingNoteId as unknown as string;
  }
  // URL schema carries a single `visibility` enum; the SavedView VO stores
  // it as an array to keep room for future multi-select UI without a port
  // break. Until that UI lands we project the first value back into the
  // URL (see `.issue/31/adr.md` ADR-002).
  if (view.query.visibilityFilter.length > 0) {
    out.visibility = view.query.visibilityFilter[0];
  }
  if (view.query.dateRange !== null) {
    if (view.query.dateRange.from !== null) {
      out.from = isoToDateOnly(view.query.dateRange.from);
    }
    if (view.query.dateRange.to !== null) {
      out.to = isoToDateOnly(view.query.dateRange.to);
    }
  }
  if (resolveTagNames !== undefined && view.query.tagIds.length > 0) {
    const names = resolveTagNames(
      view.query.tagIds.map((id) => id as unknown as string),
    );
    if (names.length > 0) out.tagNames = [...names];
  }
  return out;
}

/**
 * Build the `referencingNoteId` chip label for the FilterBar.
 *
 * When the home loader resolved the referenced note's title the chip
 * shows that title; otherwise it falls back to the first 8 characters
 * of the id (the existing pre-resolver behaviour).
 */
export function formatReferencingNoteChipLabel(
  id: string,
  title: string | null,
): string {
  if (title !== null && title !== "") return title;
  return id.slice(0, 8);
}

function isoToDateOnly(iso: string): string {
  // The view-query payload uses full ISO datetime, but the URL search
  // schema constrains `from` / `to` to `YYYY-MM-DD`. Slice rather than
  // round-trip through `Date` to avoid timezone drift.
  return iso.slice(0, 10);
}

/**
 * Compare two `ViewQueryDTO`s for shape equality. Used by the UI to
 * detect "is the current search exactly the saved view".
 */
export function viewQueryEquals(
  a: ViewQueryDTO | null,
  b: ViewQueryDTO | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.directoryId !== b.directoryId) return false;
  if (a.keyword !== b.keyword) return false;
  if (a.referencingNoteId !== b.referencingNoteId) return false;
  if (a.tagIds.length !== b.tagIds.length) return false;
  for (let i = 0; i < a.tagIds.length; i++) {
    if (a.tagIds[i] !== b.tagIds[i]) return false;
  }
  if (a.visibilityFilter.length !== b.visibilityFilter.length) return false;
  for (let i = 0; i < a.visibilityFilter.length; i++) {
    if (a.visibilityFilter[i] !== b.visibilityFilter[i]) return false;
  }
  if (a.dateRange === null && b.dateRange === null) return true;
  if (a.dateRange === null || b.dateRange === null) return false;
  return (
    a.dateRange.from === b.dateRange.from && a.dateRange.to === b.dateRange.to
  );
}
