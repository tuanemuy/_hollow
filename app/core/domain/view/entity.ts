import { Version } from "@/core/domain/common/version";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { PublicationVisibility } from "@/core/domain/publication/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import {
  BrokenConditionMarker,
  CalendarDateKey,
  DateRange,
  DisplayMode,
  SavedViewId,
  SavedViewName,
  SortBy,
  SortDirection,
  ViewKeyword,
  ViewKind,
  ViewQuery,
  type ViewSort,
} from "./valueObject";

/**
 * Named saved search (filter + display options) owned by a single user.
 *
 * `isDefault` is a tri-state across the per-(owner, kind) scope: at most
 * one `SavedView` may be flagged as the default for a given pair. The
 * single-default invariant spans the aggregate boundary and is enforced
 * by `SavedViewService.ensureSingleDefault`, not by the entity itself.
 *
 * `brokenConditions` is a transient bookkeeping field — populated by
 * `markBroken` when deleted entities are detected in `query`, cleared
 * by `repairBrokenConditions`. The query itself is left untouched until
 * the repair call so the owner can decide between "fix it" and "discard
 * the view".
 */
export type SavedView = Readonly<{
  id: SavedViewId;
  ownerId: UserId;
  name: SavedViewName;
  kind: ViewKind;
  query: ViewQuery;
  displayMode: DisplayMode;
  calendarDateKey: CalendarDateKey;
  sort: ViewSort;
  isDefault: boolean;
  brokenConditions: readonly BrokenConditionMarker[];
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

function rename(view: SavedView, newName: SavedViewName, now: Date): SavedView {
  if (SavedViewName.equals(view.name, newName)) {
    return view;
  }
  return {
    ...view,
    name: newName,
    version: Version.next(view.version),
    updatedAt: now,
  };
}

function updateQuery(view: SavedView, query: ViewQuery, now: Date): SavedView {
  if (ViewQuery.equals(view.query, query)) {
    return view;
  }
  return {
    ...view,
    query,
    version: Version.next(view.version),
    updatedAt: now,
  };
}

function setDisplayMode(
  view: SavedView,
  mode: DisplayMode,
  calendarDateKey: CalendarDateKey,
  now: Date,
): SavedView {
  if (view.displayMode === mode && view.calendarDateKey === calendarDateKey) {
    return view;
  }
  return {
    ...view,
    displayMode: mode,
    calendarDateKey,
    version: Version.next(view.version),
    updatedAt: now,
  };
}

function setSort(view: SavedView, sort: ViewSort, now: Date): SavedView {
  if (view.sort.by === sort.by && view.sort.direction === sort.direction) {
    return view;
  }
  return {
    ...view,
    sort,
    version: Version.next(view.version),
    updatedAt: now,
  };
}

function markDefault(view: SavedView, now: Date): SavedView {
  if (view.isDefault) {
    return view;
  }
  return {
    ...view,
    isDefault: true,
    version: Version.next(view.version),
    updatedAt: now,
  };
}

function unmarkDefault(view: SavedView, now: Date): SavedView {
  if (!view.isDefault) {
    return view;
  }
  return {
    ...view,
    isDefault: false,
    version: Version.next(view.version),
    updatedAt: now,
  };
}

function markBroken(
  view: SavedView,
  markers: readonly BrokenConditionMarker[],
  now: Date,
): SavedView {
  // Collapse to (kind, id) so re-detection on later runs replaces the
  // existing marker rather than accumulating duplicates. `lastSeenAt`
  // from the incoming batch wins so the UI surfaces the most recent
  // detection time.
  const byKey = new Map<string, BrokenConditionMarker>();
  for (const marker of view.brokenConditions) {
    byKey.set(`${marker.kind}:${marker.id}`, marker);
  }
  for (const marker of markers) {
    const key = `${marker.kind}:${marker.id}`;
    const existing = byKey.get(key);
    // ADR-B: the delete-event path carries a captured name while the
    // `detectBrokenConditions` re-scan path passes an empty string.
    // When the incoming marker has no name but the existing one does,
    // keep the existing name (and adopt the incoming timestamp) so a
    // re-scan never blanks out a name the event path already snapped.
    if (
      existing !== undefined &&
      marker.lastSeenName.length === 0 &&
      existing.lastSeenName.length > 0
    ) {
      byKey.set(key, { ...marker, lastSeenName: existing.lastSeenName });
    } else {
      byKey.set(key, marker);
    }
  }
  const merged = Array.from(byKey.values());

  if (merged.length === view.brokenConditions.length) {
    let allSame = true;
    for (let i = 0; i < merged.length; i += 1) {
      const next = merged[i];
      const prev = view.brokenConditions[i];
      if (next === undefined || prev === undefined) {
        allSame = false;
        break;
      }
      // `equals` is (kind, id)-only, so also compare the snapshot fields
      // to detect a name / timestamp refresh that should bump version.
      if (
        !BrokenConditionMarker.equals(next, prev) ||
        next.lastSeenName !== prev.lastSeenName ||
        next.lastSeenAt.getTime() !== prev.lastSeenAt.getTime()
      ) {
        allSame = false;
        break;
      }
    }
    if (allSame) {
      return view;
    }
  }

  return {
    ...view,
    brokenConditions: Object.freeze(merged),
    version: Version.next(view.version),
    updatedAt: now,
  };
}

function repairBrokenConditions(view: SavedView, now: Date): SavedView {
  if (view.brokenConditions.length === 0) {
    return view;
  }

  const brokenTagIds = new Set<string>();
  const brokenDirectoryIds = new Set<string>();
  const brokenNoteIds = new Set<string>();
  for (const marker of view.brokenConditions) {
    if (marker.kind === "tag") {
      brokenTagIds.add(marker.id);
    } else if (marker.kind === "directory") {
      brokenDirectoryIds.add(marker.id);
    } else {
      brokenNoteIds.add(marker.id);
    }
  }

  const repairedTagIds = view.query.tagIds.filter(
    (id) => !brokenTagIds.has(id),
  );
  const repairedDirectoryId =
    view.query.directoryId !== null &&
    brokenDirectoryIds.has(view.query.directoryId)
      ? null
      : view.query.directoryId;
  const repairedReferencingNoteId =
    view.query.referencingNoteId !== null &&
    brokenNoteIds.has(view.query.referencingNoteId)
      ? null
      : view.query.referencingNoteId;

  const repairedQuery = ViewQuery.create({
    directoryId: repairedDirectoryId,
    tagIds: repairedTagIds,
    dateRange: view.query.dateRange,
    keyword: view.query.keyword,
    referencingNoteId: repairedReferencingNoteId,
    visibilityFilter: view.query.visibilityFilter,
  });

  return {
    ...view,
    query: repairedQuery,
    brokenConditions: Object.freeze([]),
    version: Version.next(view.version),
    updatedAt: now,
  };
}

// Loose-typed because adapters feed untrusted persistence rows; each
// field is re-validated through its value object inside `reconstruct`.
type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  name: string;
  kind: string;
  query: {
    directoryId: string | null;
    tagIds: readonly string[];
    dateRange: {
      from: Date | null;
      to: Date | null;
    } | null;
    keyword: string | null;
    referencingNoteId: string | null;
    visibilityFilter: readonly string[];
  };
  displayMode: string;
  calendarDateKey: string;
  sort: {
    by: string;
    direction: string;
  };
  isDefault: boolean;
  brokenConditions: ReadonlyArray<{
    kind: string;
    id: string;
    // Optional for backward compatibility: rows persisted before Issue
    // #405 do not carry `lastSeenName`. Reconstruct falls back to "".
    lastSeenName?: string;
    lastSeenAt: Date;
  }>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export const SavedView = {
  /**
   * Construct a fresh `SavedView`. `isDefault` defaults to `false`; the
   * default flag is flipped via `markDefault` after
   * `SavedViewService.ensureSingleDefault` has unmarked any sibling.
   */
  create: (
    params: {
      id: string;
      ownerId: UserId;
      name: SavedViewName;
      kind: ViewKind;
      query: ViewQuery;
      displayMode: DisplayMode;
      calendarDateKey: CalendarDateKey;
      sort: ViewSort;
      isDefault?: boolean;
    },
    now: Date,
  ): SavedView => ({
    id: SavedViewId.create(params.id),
    ownerId: params.ownerId,
    name: params.name,
    kind: params.kind,
    query: params.query,
    displayMode: params.displayMode,
    calendarDateKey: params.calendarDateKey,
    sort: params.sort,
    isDefault: params.isDefault ?? false,
    brokenConditions: Object.freeze([]),
    version: Version.initial(),
    createdAt: now,
    updatedAt: now,
  }),

  rename,
  updateQuery,
  setDisplayMode,
  setSort,
  markDefault,
  unmarkDefault,
  markBroken,
  repairBrokenConditions,

  // Value objects throw `BusinessRuleError` from fresh-input paths; the
  // same failure during rehydration means stored data has drifted from
  // the schema, so wrap into `RehydrationError`. Adapters translate
  // that to `SystemError(DataIntegrityError)`; usecases never see either.
  reconstruct: (input: ReconstructInput): SavedView => {
    try {
      const id = SavedViewId.create(input.id);
      const ownerId = input.ownerId as UserId;
      const name = SavedViewName.create(input.name);
      const kind = ViewKind.create(input.kind);
      const displayMode = DisplayMode.create(input.displayMode);
      const calendarDateKey = CalendarDateKey.create(input.calendarDateKey);
      const sort: ViewSort = {
        by: SortBy.create(input.sort.by),
        direction: SortDirection.create(input.sort.direction),
      };
      const version = Version.create(input.version);

      const tagIds = input.query.tagIds.map((raw) => raw as TagId);
      const directoryId =
        input.query.directoryId === null
          ? null
          : (input.query.directoryId as DirectoryId);
      const referencingNoteId =
        input.query.referencingNoteId === null
          ? null
          : (input.query.referencingNoteId as NoteId);
      const keyword =
        input.query.keyword === null
          ? null
          : ViewKeyword.create(input.query.keyword);
      const dateRange =
        input.query.dateRange === null
          ? null
          : DateRange.create({
              from: input.query.dateRange.from,
              to: input.query.dateRange.to,
            });

      const visibilityFilter = input.query.visibilityFilter.map((raw) =>
        PublicationVisibility.create(raw),
      );

      const query = ViewQuery.create({
        directoryId,
        tagIds,
        dateRange,
        keyword,
        referencingNoteId,
        visibilityFilter,
      });

      const brokenConditions = input.brokenConditions.map((row) => {
        const markerKind = BrokenConditionMarker.createKind(row.kind);
        const lastSeenName = row.lastSeenName ?? "";
        if (markerKind === "tag") {
          return BrokenConditionMarker.tag(
            row.id as TagId,
            lastSeenName,
            row.lastSeenAt,
          );
        }
        if (markerKind === "directory") {
          return BrokenConditionMarker.directory(
            row.id as DirectoryId,
            lastSeenName,
            row.lastSeenAt,
          );
        }
        return BrokenConditionMarker.note(
          row.id as NoteId,
          lastSeenName,
          row.lastSeenAt,
        );
      });

      return {
        id,
        ownerId,
        name,
        kind,
        query,
        displayMode,
        calendarDateKey,
        sort,
        isDefault: input.isDefault,
        brokenConditions: Object.freeze(brokenConditions),
        version,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate SavedView (id=${input.id})`,
        error,
      );
    }
  },
};
