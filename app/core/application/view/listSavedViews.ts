import type { UserId } from "@/core/domain/identity/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { SavedViewService } from "@/core/domain/view/service";
import { ViewKind } from "@/core/domain/view/valueObject";
import { type SavedViewDTO, toSavedViewDTO } from "../dto/view";
import type { ServiceArgs } from "../types";

export type ListSavedViewsInput = Readonly<{
  actorUserId: string;
  kind: "personal" | "public";
}>;

export type ListSavedViewsOutput = Readonly<{
  views: readonly SavedViewDTO[];
}>;

export async function listSavedViews({
  container,
  input,
}: ServiceArgs<ListSavedViewsInput>): Promise<ListSavedViewsOutput> {
  const now = container.clock.now();
  const ownerId = input.actorUserId as UserId;
  const kind = ViewKind.create(input.kind);

  const refreshed = await container.unitOfWorkProvider.run(
    async ({
      savedViewRepository,
      directoryRepository,
      tagRepository,
      noteRepository,
    }) => {
      const views = await savedViewRepository.findByOwner(ownerId, kind);

      const results: SavedView[] = [];
      for (const view of views) {
        const markers = await SavedViewService.detectBrokenConditions(
          view,
          now,
          {
            dirRepo: directoryRepository,
            tagRepo: tagRepository,
            noteRepo: noteRepository,
          },
        );
        if (markers.length === 0 && view.brokenConditions.length === 0) {
          results.push(view);
          continue;
        }

        const next = SavedView.markBroken(view, markers, now);
        if (next === view) {
          results.push(view);
          continue;
        }
        const versioned = await savedViewRepository.findById(view.id);
        if (versioned === null) {
          results.push(next);
          continue;
        }
        await savedViewRepository.save(next, versioned.expectedVersion);
        results.push(next);
      }
      return results;
    },
  );

  return { views: refreshed.map(toSavedViewDTO) };
}
