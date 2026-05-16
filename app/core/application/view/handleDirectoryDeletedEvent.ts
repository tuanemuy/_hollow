import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { BrokenConditionMarker } from "@/core/domain/view/valueObject";
import type { ServiceArgs } from "../types";

export type HandleDirectoryDeletedEventInput = Readonly<{
  directoryId: string;
}>;

/**
 * Mark every SavedView whose query references `directoryId` as having a
 * broken directory reference. Idempotent.
 */
export async function handleDirectoryDeletedEvent({
  container,
  input,
}: ServiceArgs<HandleDirectoryDeletedEventInput>): Promise<void> {
  const now = container.clock.now();
  const directoryId = input.directoryId as DirectoryId;

  await container.unitOfWorkProvider.run(async ({ savedViewRepository }) => {
    const candidates =
      await savedViewRepository.findReferencingDirectory(directoryId);
    for (const view of candidates) {
      const marker = BrokenConditionMarker.directory(directoryId, now);
      const next = SavedView.markBroken(view, [marker], now);
      if (next === view) {
        continue;
      }
      const versioned = await savedViewRepository.findById(view.id);
      if (versioned === null) {
        continue;
      }
      await savedViewRepository.save(next, versioned.expectedVersion);
    }
  });
}
