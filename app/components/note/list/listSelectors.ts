/**
 * Pure logic for the home / note-list page.
 *
 * Everything in this module is React-agnostic so it can be tested in
 * isolation with vitest. The selection reducer, day grouping and
 * URL <-> ViewQuery translators all live here; the React components
 * import the functions but never the other way round.
 */

import type { SavedViewDTO, ViewQueryDTO } from "@/core/application/dto/view";
import type { NoteListSearch } from "../schema";

export type NoteId = string;

export type SelectionState = Readonly<{
  ids: ReadonlySet<NoteId>;
}>;

export type SelectionAction =
  | Readonly<{ type: "toggle"; id: NoteId }>
  | Readonly<{ type: "selectMany"; ids: readonly NoteId[] }>
  | Readonly<{ type: "selectAll"; ids: readonly NoteId[] }>
  | Readonly<{ type: "clear" }>;

export const emptySelection: SelectionState = { ids: new Set<NoteId>() };

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state.ids);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ids: next };
    }
    case "selectMany": {
      const next = new Set(state.ids);
      for (const id of action.ids) next.add(id);
      return { ids: next };
    }
    case "selectAll": {
      return { ids: new Set(action.ids) };
    }
    case "clear": {
      if (state.ids.size === 0) return state;
      return emptySelection;
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
