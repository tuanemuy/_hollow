import type { UserId } from "@/core/domain/identity/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { SavedViewService } from "@/core/domain/view/service";
import {
  SAVED_VIEW_NAME_MAX_LENGTH,
  SavedViewName,
} from "@/core/domain/view/valueObject";
import { type SavedViewDTO, toSavedViewDTO } from "../dto/view";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DuplicateSavedViewInput = Readonly<{
  actorUserId: string;
  viewId: string;
}>;

export type DuplicateSavedViewOutput = Readonly<{ view: SavedViewDTO }>;

const COPY_SUFFIX = " のコピー";

/**
 * Build the duplicate's name from the original. The first candidate is
 * "`{original} のコピー`"; on collision a " 2", " 3", ... ordinal is
 * appended. The original portion is truncated so the full candidate
 * (suffix + ordinal included) stays within `SAVED_VIEW_NAME_MAX_LENGTH`,
 * which `SavedViewName.create` would otherwise reject.
 */
function buildCopyName(originalName: string, ordinal: number): string {
  const ordinalPart = ordinal <= 1 ? "" : ` ${ordinal}`;
  const reserved = COPY_SUFFIX.length + ordinalPart.length;
  const available = SAVED_VIEW_NAME_MAX_LENGTH - reserved;
  const base =
    originalName.length > available
      ? originalName.slice(0, Math.max(0, available)).trimEnd()
      : originalName;
  return `${base}${COPY_SUFFIX}${ordinalPart}`;
}

export async function duplicateSavedView({
  container,
  input,
}: ServiceArgs<DuplicateSavedViewInput>): Promise<DuplicateSavedViewOutput> {
  const now = container.clock.now();
  const actorUserId = input.actorUserId as UserId;
  const newId = container.idGenerator.next();

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

      const original = found.entity;

      let ordinal = 1;
      let name = SavedViewName.create(buildCopyName(original.name, ordinal));
      while (
        (await savedViewRepository.findByName(
          original.ownerId,
          original.kind,
          name,
        )) !== null
      ) {
        ordinal += 1;
        name = SavedViewName.create(buildCopyName(original.name, ordinal));
      }

      const draft = SavedView.create(
        {
          id: newId,
          ownerId: original.ownerId,
          name,
          kind: original.kind,
          query: original.query,
          displayMode: original.displayMode,
          calendarDateKey: original.calendarDateKey,
          sort: original.sort,
          isDefault: false,
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
