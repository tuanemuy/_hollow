import type { SavedView } from "@/core/domain/view/entity";
import type { ViewQuery } from "@/core/domain/view/valueObject";
import type { DateRange, Instant } from "./common";
import { toInstant } from "./common";

export type ViewQueryDTO = Readonly<{
  directoryId: string | null;
  tagIds: readonly string[];
  dateRange: DateRange | null;
  keyword: string | null;
  referencingNoteId: string | null;
  visibilityFilter: ReadonlyArray<"private" | "unlisted" | "public">;
}>;

/**
 * Snapshot variant of `ViewQueryDTO` carried by exports. Structurally
 * identical for now; kept as a distinct alias so future schema drift
 * (e.g. resolved tag names baked into the snapshot) is a non-breaking
 * change at the type boundary.
 */
export type ViewQuerySnapshotDTO = ViewQueryDTO;

export type SavedViewDTO = Readonly<{
  id: string;
  ownerId: string;
  name: string;
  kind: "personal" | "public";
  query: ViewQueryDTO;
  displayMode: "list" | "tile" | "calendar";
  calendarDateKey: "updated" | "created" | "frontMatterDate";
  sort: Readonly<{
    by: "updatedAt" | "createdAt" | "title";
    direction: "asc" | "desc";
  }>;
  isDefault: boolean;
  brokenConditions: ReadonlyArray<
    Readonly<{
      kind: "tag" | "directory" | "note";
      id: string;
      // Snapshot of the referenced entity's display name at the moment
      // the reference broke (Issue #405 ADR-A). Empty string when the
      // name could not be captured (legacy rows / re-scan path).
      lastSeenName: string;
      lastSeenAt: Instant;
    }>
  >;
}>;

export function toViewQueryDTO(query: ViewQuery): ViewQueryDTO {
  return {
    directoryId: query.directoryId,
    tagIds: query.tagIds,
    dateRange:
      query.dateRange === null
        ? null
        : {
            from:
              query.dateRange.from === null
                ? null
                : query.dateRange.from.toISOString(),
            to:
              query.dateRange.to === null
                ? null
                : query.dateRange.to.toISOString(),
          },
    keyword: query.keyword === null ? null : (query.keyword as string),
    referencingNoteId: query.referencingNoteId,
    visibilityFilter: query.visibilityFilter.map((v) => v),
  };
}

export function toSavedViewDTO(view: SavedView): SavedViewDTO {
  return {
    id: view.id,
    ownerId: view.ownerId,
    name: view.name,
    kind: view.kind,
    query: toViewQueryDTO(view.query),
    displayMode: view.displayMode,
    calendarDateKey: view.calendarDateKey,
    sort: { by: view.sort.by, direction: view.sort.direction },
    isDefault: view.isDefault,
    brokenConditions: view.brokenConditions.map((marker) => ({
      kind: marker.kind,
      id: marker.id as string,
      lastSeenName: marker.lastSeenName,
      lastSeenAt: toInstant(marker.lastSeenAt),
    })),
  };
}
