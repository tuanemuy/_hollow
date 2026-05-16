import type { SavedView } from "@/core/domain/view/entity";
import type { ViewQuery } from "@/core/domain/view/valueObject";
import type { DateRange, Instant } from "./common";
import { toInstant } from "./common";
import type { DirectoryId } from "./directory";
import type { UserId } from "./identity";
import type { NoteId } from "./note";
import type { TagId } from "./tag";

export type SavedViewId = string & { readonly __brand: "SavedViewId" };

export type ViewQueryDTO = Readonly<{
  directoryId: DirectoryId | null;
  tagIds: readonly TagId[];
  dateRange: DateRange | null;
  keyword: string | null;
  referencingNoteId: NoteId | null;
}>;

/**
 * Snapshot variant of `ViewQueryDTO` carried by exports. Structurally
 * identical for now; kept as a distinct alias so future schema drift
 * (e.g. resolved tag names baked into the snapshot) is a non-breaking
 * change at the type boundary.
 */
export type ViewQuerySnapshotDTO = ViewQueryDTO;

export type SavedViewDTO = Readonly<{
  id: SavedViewId;
  ownerId: UserId;
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
      lastSeenAt: Instant;
    }>
  >;
}>;

export function toViewQueryDTO(query: ViewQuery): ViewQueryDTO {
  return {
    directoryId:
      query.directoryId === null
        ? null
        : (query.directoryId as unknown as DirectoryId),
    tagIds: query.tagIds.map((id) => id as unknown as TagId),
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
    referencingNoteId:
      query.referencingNoteId === null
        ? null
        : (query.referencingNoteId as unknown as NoteId),
  };
}

export function toSavedViewDTO(view: SavedView): SavedViewDTO {
  return {
    id: view.id as unknown as SavedViewId,
    ownerId: view.ownerId as unknown as UserId,
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
      lastSeenAt: toInstant(marker.lastSeenAt),
    })),
  };
}
