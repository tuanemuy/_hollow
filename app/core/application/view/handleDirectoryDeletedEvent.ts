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
 *
 * Routed from `directory.deleted` by `dispatchDomainEvent` (Issue #181).
 * `Directory.DeleteDirectory` emits a physical `directory.deleted` for
 * every removed directory — including empty ones the `note.trashed`
 * fan-out cannot cover — so this handler runs once per deleted directory.
 * This supersedes Issue #159 ADR-003, where `directory.deleted` was not a
 * physical event and the handler stayed dormant. The `note.trashed` route
 * (via `view.handleNotePurgedEvent`) still independently marks `note`
 * references broken; the two routes set different `BrokenConditionMarker`
 * kinds. See `spec/domains/index.md` (購読対応表 — `directory.deleted` 行).
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
