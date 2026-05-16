import { MediaService } from "@/core/domain/media/service";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type { ServiceArgs } from "../types";

export type AttachMediaToNoteInput = Readonly<{
  noteBeforeIds: readonly MediaAssetId[];
  noteAfterIds: readonly MediaAssetId[];
}>;

/**
 * Internal handler invoked after a Note save commits. Reconciles ref
 * counts on every asset that appears in the `after` set (incremented),
 * the `before` set but not the `after` set (decremented). Idempotent —
 * missing assets are silently skipped, so a duplicate dispatch from the
 * at-least-once outbox does not corrupt counts.
 */
export async function attachMediaToNote({
  container,
  input,
}: ServiceArgs<AttachMediaToNoteInput>): Promise<void> {
  const now = container.clock.now();

  await container.unitOfWorkProvider.run(async ({ mediaAssetRepository }) => {
    await MediaService.reconcileRefs(
      input.noteBeforeIds,
      input.noteAfterIds,
      now,
      mediaAssetRepository,
    );
  });
}
