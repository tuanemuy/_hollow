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
 * NOTE (Issue #159 ADR-003): this handler is intentionally NOT wired into
 * the production dispatcher (`dispatchDomainEvent`). `directory.deleted`
 * is not a physical domain event — `Directory.DeleteDirectory` only emits
 * `note.trashed` for each child note, and the SavedView broken marker is
 * fanned out through that `note.trashed` route by reusing
 * `view.handleNotePurgedEvent`. The handler is preserved to keep the door
 * open if a future design promotes directory-level broken markers to a
 * first-class event; until then it is dormant code. See
 * `spec/domains/index.md` (購読対応表 — `directory.deleted` 行の注記) for the
 * symmetric spec-side acknowledgement.
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
