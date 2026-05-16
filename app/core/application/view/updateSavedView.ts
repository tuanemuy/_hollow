import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { SavedViewService } from "@/core/domain/view/service";
import {
  CalendarDateKey,
  DateRange,
  DisplayMode,
  SavedViewName,
  SortBy,
  SortDirection,
  ViewKeyword,
  ViewQuery,
  type ViewSort,
} from "@/core/domain/view/valueObject";
import { type SavedViewDTO, toSavedViewDTO } from "../dto/view";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type UpdateSavedViewInput = Readonly<{
  actorUserId: string;
  viewId: string;
  name?: string;
  query?: Readonly<{
    directoryId: string | null;
    tagIds: readonly string[];
    dateRange: Readonly<{ from: string | null; to: string | null }> | null;
    keyword: string | null;
    referencingNoteId: string | null;
  }>;
  displayMode?: "list" | "tile" | "calendar";
  calendarDateKey?: "updated" | "created" | "frontMatterDate";
  sort?: Readonly<{
    by: "updatedAt" | "createdAt" | "title";
    direction: "asc" | "desc";
  }>;
  isDefault?: boolean;
}>;

export type UpdateSavedViewOutput = Readonly<{ view: SavedViewDTO }>;

function buildQuery(
  input: NonNullable<UpdateSavedViewInput["query"]>,
): ViewQuery {
  return ViewQuery.create({
    directoryId:
      input.directoryId === null ? null : (input.directoryId as DirectoryId),
    tagIds: input.tagIds.map((id) => id as TagId),
    dateRange:
      input.dateRange === null
        ? null
        : DateRange.create({
            from:
              input.dateRange.from === null
                ? null
                : new Date(input.dateRange.from),
            to:
              input.dateRange.to === null ? null : new Date(input.dateRange.to),
          }),
    keyword: input.keyword === null ? null : ViewKeyword.create(input.keyword),
    referencingNoteId:
      input.referencingNoteId === null
        ? null
        : (input.referencingNoteId as NoteId),
  });
}

export async function updateSavedView({
  container,
  input,
}: ServiceArgs<UpdateSavedViewInput>): Promise<UpdateSavedViewOutput> {
  const now = container.clock.now();
  const actorUserId = input.actorUserId as UserId;

  const persisted = await container.unitOfWorkProvider.run(
    async ({
      savedViewRepository,
      directoryRepository,
      tagRepository,
      noteRepository,
    }) => {
      const found = await savedViewRepository.findById(input.viewId);
      if (found === null) {
        throw new NotFoundError(
          "SAVED_VIEW_NOT_FOUND",
          `Saved view not found: ${input.viewId}`,
        );
      }
      if (found.entity.ownerId !== actorUserId) {
        throw new ForbiddenError(
          "SAVED_VIEW_FORBIDDEN",
          `Saved view ${input.viewId} is not owned by actor`,
        );
      }

      let next = found.entity;

      if (input.name !== undefined) {
        const newName = SavedViewName.create(input.name);
        await SavedViewService.assertNameUnique(
          next.ownerId,
          next.kind,
          newName,
          next.id,
          savedViewRepository,
        );
        next = SavedView.rename(next, newName, now);
      }

      if (input.query !== undefined) {
        next = SavedView.updateQuery(next, buildQuery(input.query), now);
      }

      if (
        input.displayMode !== undefined ||
        input.calendarDateKey !== undefined
      ) {
        const displayMode =
          input.displayMode !== undefined
            ? DisplayMode.create(input.displayMode)
            : next.displayMode;
        const calendarDateKey =
          input.calendarDateKey !== undefined
            ? CalendarDateKey.create(input.calendarDateKey)
            : next.calendarDateKey;
        next = SavedView.setDisplayMode(
          next,
          displayMode,
          calendarDateKey,
          now,
        );
      }

      if (input.sort !== undefined) {
        const sort: ViewSort = {
          by: SortBy.create(input.sort.by),
          direction: SortDirection.create(input.sort.direction),
        };
        next = SavedView.setSort(next, sort, now);
      }

      if (input.isDefault !== undefined) {
        if (input.isDefault && !next.isDefault) {
          await SavedViewService.ensureSingleDefault(
            next.ownerId,
            next.kind,
            next.id,
            now,
            savedViewRepository,
          );
          next = SavedView.markDefault(next, now);
        } else if (!input.isDefault && next.isDefault) {
          next = SavedView.unmarkDefault(next, now);
        }
      }

      const markers = await SavedViewService.detectBrokenConditions(next, now, {
        dirRepo: directoryRepository,
        tagRepo: tagRepository,
        noteRepo: noteRepository,
      });
      next =
        markers.length === 0 ? next : SavedView.markBroken(next, markers, now);

      if (next === found.entity) {
        return found.entity;
      }
      await savedViewRepository.save(next, found.expectedVersion);
      return next;
    },
  );

  return { view: toSavedViewDTO(persisted) };
}
