import { MediaAsset } from "@/core/domain/media/entity";
import type { NotePurgedEvent } from "@/core/domain/note/events";
import type { ServiceArgs } from "../types";
import { attachMediaToNote } from "./attachMediaToNote";

export type HandleNotePurgedEventInput = Readonly<{
  event: NotePurgedEvent;
}>;

/**
 * Queue-consumer hook fired when a Note is purged. Releases every media
 * reference the note held by treating the purged set as "all before / no
 * after". The shared `attachMediaToNote` handler keeps the diff logic in
 * a single place so the queue consumer and the post-save hook agree.
 *
 * In addition to the body-embedded `mediaRefs`, the note may carry a
 * persistent `sourceFileId` (the ingested original). That asset is bound
 * 1:1 outside the refCount machinery, so it is detached here explicitly:
 * `decrementRef` (refCount 1 → 0 → orphan) hands the blob to the standard
 * purge worker (Issue #452 ADR-005).
 */
export async function handleNotePurgedEvent({
  container,
  input,
}: ServiceArgs<HandleNotePurgedEventInput>): Promise<void> {
  await attachMediaToNote({
    container,
    input: {
      noteBeforeIds: input.event.payload.mediaRefs,
      noteAfterIds: [],
    },
  });

  const sourceFileId = input.event.payload.sourceFileId;
  if (sourceFileId === null) return;

  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async ({ mediaAssetRepository }) => {
    const asset = await mediaAssetRepository.findById(sourceFileId);
    if (asset === null) return;
    // Idempotent guard: the outbox is at-least-once, and `decrementRef`
    // only accepts `pending`/`attached`. A redelivered event whose asset
    // is already `orphan`/`deleting` is a no-op — mirrors
    // `MediaService.reconcileRefs`' removal path.
    if (asset.status === "orphan" || asset.status === "deleting") return;
    // `decrementRef`'s `media.orphaned` draft is discarded, mirroring
    // `MediaService.reconcileRefs`: `media.*` events are dispatcher-skipped
    // and the purge worker reclaims orphans via a status query, so no
    // consumer reads these drafts.
    const { entity } = MediaAsset.decrementRef(asset, now);
    await mediaAssetRepository.save(entity);
  });
}
