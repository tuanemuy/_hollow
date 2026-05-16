import type { TagId } from "@/core/domain/tag/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import { BrokenConditionMarker } from "@/core/domain/view/valueObject";
import type { ServiceArgs } from "../types";

export type HandleTagDeletedEventInput = Readonly<{
  tagId: string;
}>;

/**
 * Mark every SavedView whose query references `tagId` as having a broken
 * tag reference. Idempotent: re-running with the same input collapses on
 * the marker key and the OCC guard rejects stale writes.
 */
export async function handleTagDeletedEvent({
  container,
  input,
}: ServiceArgs<HandleTagDeletedEventInput>): Promise<void> {
  const now = container.clock.now();
  const tagId = input.tagId as TagId;

  await container.unitOfWorkProvider.run(async ({ savedViewRepository }) => {
    const candidates = await savedViewRepository.findReferencingTag(tagId);
    for (const view of candidates) {
      const marker = BrokenConditionMarker.tag(tagId, now);
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
