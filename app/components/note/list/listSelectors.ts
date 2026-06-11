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
  // Whether a bulk mutation (trash) over the current selection is in flight.
  // Lives here so the list rows can dim the selected items for the duration
  // without prop-drilling the BulkActionBar's transition pending (#635 ADR-002).
  pendingBulk: boolean;
}>;

export type SelectionAction =
  | Readonly<{ type: "toggle"; id: NoteId }>
  | Readonly<{ type: "selectMany"; ids: readonly NoteId[] }>
  | Readonly<{ type: "selectAll"; ids: readonly NoteId[] }>
  | Readonly<{ type: "clear" }>
  | Readonly<{ type: "enterSelectMode" }>
  | Readonly<{ type: "exitSelectMode" }>
  | Readonly<{ type: "toggleSelectMode" }>
  | Readonly<{ type: "setPendingBulk"; value: boolean }>;

export const emptySelection: SelectionState = {
  ids: new Set<NoteId>(),
  mode: false,
  pendingBulk: false,
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
      return { ids: next, mode: state.mode, pendingBulk: state.pendingBulk };
    }
    case "selectMany": {
      const next = new Set(state.ids);
      for (const id of action.ids) next.add(id);
      return { ids: next, mode: state.mode, pendingBulk: state.pendingBulk };
    }
    case "selectAll": {
      return {
        ids: new Set(action.ids),
        mode: state.mode,
        pendingBulk: state.pendingBulk,
      };
    }
    case "clear": {
      if (state.ids.size === 0) return state;
      return {
        ids: new Set<NoteId>(),
        mode: state.mode,
        pendingBulk: state.pendingBulk,
      };
    }
    case "enterSelectMode": {
      if (state.mode) return state;
      return { ids: state.ids, mode: true, pendingBulk: state.pendingBulk };
    }
    case "exitSelectMode": {
      // Leaving selection mode discards the pending selection so re-entering
      // starts clean.
      if (!state.mode && state.ids.size === 0 && !state.pendingBulk)
        return state;
      return emptySelection;
    }
    case "toggleSelectMode": {
      return state.mode
        ? emptySelection
        : { ids: state.ids, mode: true, pendingBulk: state.pendingBulk };
    }
    case "setPendingBulk": {
      if (state.pendingBulk === action.value) return state;
      return { ids: state.ids, mode: state.mode, pendingBulk: action.value };
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
 *
 * `getDate` extracts the ISO timestamp the bucketing is keyed on. It
 * defaults to `note.updatedAt` so existing auth-side callers are
 * unaffected; the public listing passes the publication `publishedAt`
 * (falling back to `updatedAt`) so its three views share one date axis
 * (#619 ADR-003).
 */
export function groupNotesByDay<T extends { id: string; updatedAt: string }>(
  notes: readonly T[],
  tz: string,
  getDate: (note: T) => string = (note) => note.updatedAt,
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
    const date = new Date(getDate(note));
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
    out.directoryId = view.query.directoryId;
  }
  if (view.query.keyword !== null) {
    out.q = view.query.keyword;
  }
  if (view.query.referencingNoteId !== null) {
    out.referencingNoteId = view.query.referencingNoteId;
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
    const names = resolveTagNames(view.query.tagIds);
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

/**
 * Date-range presets offered by the FilterBar's 期間 popover (Issue #476).
 * The order here is the visual grid order in the popover.
 */
export const DATE_RANGE_PRESETS = [
  "today",
  "thisWeek",
  "thisMonth",
  "last30",
  "last90",
  "thisYear",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const dateRangePresetLabels: Readonly<Record<DateRangePreset, string>> =
  {
    today: "今日",
    thisWeek: "今週",
    thisMonth: "今月",
    last30: "過去30日",
    last90: "過去90日",
    thisYear: "今年",
  };

function toLocalDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolve a 期間 preset into a `{ from, to }` pair of `YYYY-MM-DD` strings
 * (Issue #476). `baseDate` is injected so the calculation is deterministic
 * and React-agnostic — callers pass `new Date()`; the logic here never reads
 * the ambient clock. All arithmetic is local-calendar based
 * (`getFullYear`/`getMonth`/`getDate`) so a UTC offset never shifts the day.
 *
 * Definitions:
 * - today: from = to = baseDate
 * - thisWeek: Monday..Sunday of the week containing baseDate (week starts Mon)
 * - thisMonth: 1st..last day of baseDate's month
 * - last30: baseDate − 29 days .. baseDate (30 days inclusive)
 * - last90: baseDate − 89 days .. baseDate (90 days inclusive)
 * - thisYear: Jan 1 .. baseDate
 */
export function resolveDateRangePreset(
  preset: DateRangePreset,
  baseDate: Date,
): Readonly<{ from: string; to: string }> {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const d = baseDate.getDate();
  const base = new Date(y, m, d);

  switch (preset) {
    case "today":
      return { from: toLocalDateOnly(base), to: toLocalDateOnly(base) };
    case "thisWeek": {
      // getDay(): 0=Sun..6=Sat. Shift so Monday is the week start.
      const dow = base.getDay();
      const offsetToMonday = (dow + 6) % 7;
      const monday = new Date(y, m, d - offsetToMonday);
      const sunday = new Date(y, m, d - offsetToMonday + 6);
      return { from: toLocalDateOnly(monday), to: toLocalDateOnly(sunday) };
    }
    case "thisMonth": {
      const first = new Date(y, m, 1);
      // Day 0 of the next month is the last day of this month.
      const last = new Date(y, m + 1, 0);
      return { from: toLocalDateOnly(first), to: toLocalDateOnly(last) };
    }
    case "last30": {
      const from = new Date(y, m, d - 29);
      return { from: toLocalDateOnly(from), to: toLocalDateOnly(base) };
    }
    case "last90": {
      const from = new Date(y, m, d - 89);
      return { from: toLocalDateOnly(from), to: toLocalDateOnly(base) };
    }
    case "thisYear": {
      const first = new Date(y, 0, 1);
      return { from: toLocalDateOnly(first), to: toLocalDateOnly(base) };
    }
  }
}

/**
 * Find which preset (if any) exactly matches the current `from`/`to`
 * relative to `baseDate`. Used by the popover to highlight the active
 * preset; manual edits that match no preset return `null`.
 */
export function matchDateRangePreset(
  from: string | undefined,
  to: string | undefined,
  baseDate: Date,
): DateRangePreset | null {
  if (from === undefined || to === undefined) return null;
  for (const preset of DATE_RANGE_PRESETS) {
    const r = resolveDateRangePreset(preset, baseDate);
    if (r.from === from && r.to === to) return preset;
  }
  return null;
}

/**
 * Compact chip label for an applied 期間 filter, e.g. `6/1–6/30`. Drops
 * leading zeros on month/day; when only one bound is set, renders the
 * open-ended side as `…` (`6/1–…` / `…–6/30`). Returns `null` when neither
 * bound is set (no chip should render).
 */
export function formatDateRangeChipLabel(
  from: string | undefined,
  to: string | undefined,
): string | null {
  if (from === undefined && to === undefined) return null;
  return `${shortDate(from)}–${shortDate(to)}`;
}

function shortDate(date: string | undefined): string {
  if (date === undefined) return "…";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (Number.isNaN(month) || Number.isNaN(day)) return date;
  return `${month}/${day}`;
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

/**
 * Whether the home heading should be in "search results" mode. Whitespace-only
 * queries do not count as an active search; `validateSearch` already trims /
 * drops them at the transport boundary, but the guard is kept so the heading
 * and the listing can never disagree.
 */
export function isSearchActive(q: string | undefined): boolean {
  return q !== undefined && q.trim().length > 0;
}

/** Home `<h1>` text derived purely from the search query. */
export function homeHeadingText(q: string | undefined): string {
  return isSearchActive(q) ? `「${q}」の検索結果` : "すべてのノート";
}

/** Whether any non-query filter (tags / dates / directory / visibility / backlink) is set. */
export function hasAnyHomeFilter(search: NoteListSearch): boolean {
  return (
    (search.tagNames !== undefined && search.tagNames.length > 0) ||
    search.from !== undefined ||
    search.to !== undefined ||
    search.directoryId !== undefined ||
    search.visibility !== undefined ||
    search.referencingNoteId !== undefined
  );
}

/**
 * Stable key over every loader-relevant search field, used as the
 * `SectionErrorBoundary` `resetKey` so a navigation that changes the data a
 * section streams also clears a sticky error state.
 * `display` is excluded for the same reason it is stripped from `loaderDeps`.
 */
export function homeSectionResetKey(search: NoteListSearch): string {
  return JSON.stringify([
    search.q,
    search.directoryId,
    search.viewId,
    search.visibility,
    search.referencingNoteId,
    search.tagNames,
    search.from,
    search.to,
    search.page,
    search.limit,
  ]);
}
