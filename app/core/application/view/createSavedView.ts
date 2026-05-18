import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { PublicationVisibility } from "@/core/domain/publication/valueObject";
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
  ViewKind,
  ViewQuery,
  type ViewSort,
} from "@/core/domain/view/valueObject";
import { type SavedViewDTO, toSavedViewDTO } from "../dto/view";
import type { ServiceArgs } from "../types";

export type CreateSavedViewInput = Readonly<{
  actorUserId: string;
  name: string;
  kind: "personal" | "public";
  query: Readonly<{
    directoryId: string | null;
    tagIds: readonly string[];
    dateRange: Readonly<{ from: string | null; to: string | null }> | null;
    keyword: string | null;
    referencingNoteId: string | null;
    visibilityFilter: ReadonlyArray<"private" | "unlisted" | "public">;
  }>;
  displayMode: "list" | "tile" | "calendar";
  calendarDateKey: "updated" | "created" | "frontMatterDate";
  sort: Readonly<{
    by: "updatedAt" | "createdAt" | "title";
    direction: "asc" | "desc";
  }>;
  isDefault: boolean;
}>;

export type CreateSavedViewOutput = Readonly<{ view: SavedViewDTO }>;

function buildQuery(input: CreateSavedViewInput["query"]): ViewQuery {
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
    visibilityFilter: input.visibilityFilter.map((v) =>
      PublicationVisibility.create(v),
    ),
  });
}

export async function createSavedView({
  container,
  input,
}: ServiceArgs<CreateSavedViewInput>): Promise<CreateSavedViewOutput> {
  const now = container.clock.now();
  const id = container.idGenerator.next();

  const ownerId = input.actorUserId as UserId;
  const name = SavedViewName.create(input.name);
  const kind = ViewKind.create(input.kind);
  const displayMode = DisplayMode.create(input.displayMode);
  const calendarDateKey = CalendarDateKey.create(input.calendarDateKey);
  const sort: ViewSort = {
    by: SortBy.create(input.sort.by),
    direction: SortDirection.create(input.sort.direction),
  };
  const query = buildQuery(input.query);

  const persisted = await container.unitOfWorkProvider.run(
    async ({
      savedViewRepository,
      directoryRepository,
      tagRepository,
      noteRepository,
    }) => {
      await SavedViewService.assertNameUnique(
        ownerId,
        kind,
        name,
        null,
        savedViewRepository,
      );

      if (input.isDefault) {
        await SavedViewService.ensureSingleDefault(
          ownerId,
          kind,
          null,
          now,
          savedViewRepository,
        );
      }

      const draft = SavedView.create(
        {
          id,
          ownerId,
          name,
          kind,
          query,
          displayMode,
          calendarDateKey,
          sort,
          isDefault: input.isDefault,
        },
        now,
      );

      const markers = await SavedViewService.detectBrokenConditions(
        draft,
        now,
        {
          dirRepo: directoryRepository,
          tagRepo: tagRepository,
          noteRepo: noteRepository,
        },
      );

      const finalView =
        markers.length === 0
          ? draft
          : SavedView.markBroken(draft, markers, now);

      await savedViewRepository.insert(finalView);
      return finalView;
    },
  );

  return { view: toSavedViewDTO(persisted) };
}
