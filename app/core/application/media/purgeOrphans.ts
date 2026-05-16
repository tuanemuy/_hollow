import { MediaAsset } from "@/core/domain/media/entity";
import { MediaEvents } from "@/core/domain/media/events";
import {
  isStorageNotFoundError,
  isStorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import { MediaService } from "@/core/domain/media/service";
import type { RequestContainer } from "../di/types";

export type PurgeOrphansOptions = Readonly<{
  /** Grace period for orphans before they become eligible for purge. */
  orphanAgeSec?: number;
  /** Maximum number of assets to purge per call. */
  batchSize?: number;
}>;

export type PurgeOrphansResult = Readonly<{
  purged: number;
  failed: number;
}>;

const DEFAULT_ORPHAN_AGE_SEC = 24 * 60 * 60; // 24h
const DEFAULT_BATCH_SIZE = 100;

/**
 * Cron-driven sweep: find orphaned media whose grace window has lapsed,
 * transition them to `deleting`, and finalise purge (R2 delete + DB
 * delete). Per-asset failures are isolated so one bad row does not stop
 * the rest of the batch — each is logged and counted; the next cron
 * tick will retry whatever did not succeed (orphans stay orphans until
 * deleted).
 */
export async function purgeOrphans(
  container: RequestContainer,
  options: PurgeOrphansOptions = {},
): Promise<PurgeOrphansResult> {
  const ageSec = options.orphanAgeSec ?? DEFAULT_ORPHAN_AGE_SEC;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const now = container.clock.now();
  const { logger, objectStorage } = container;

  const candidates = await container.unitOfWorkProvider.run(
    async ({ mediaAssetRepository }) =>
      MediaService.listOrphanCandidates(
        now,
        ageSec,
        mediaAssetRepository,
        batchSize,
      ),
  );

  let purged = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (!MediaAsset.isOrphan(candidate)) continue;
    try {
      const deleting = await container.unitOfWorkProvider.run(
        async ({ mediaAssetRepository, collectEvents }) => {
          const fresh = await mediaAssetRepository.findById(candidate.id);
          if (fresh === null || !MediaAsset.isOrphan(fresh)) return null;
          const { entity, eventDrafts } = MediaAsset.markDeleting(fresh, now);
          await mediaAssetRepository.save(entity);
          collectEvents(eventDrafts);
          return entity;
        },
      );
      if (deleting === null) continue;

      await container.unitOfWorkProvider.run(
        async ({ mediaAssetRepository, collectEvents }) => {
          await MediaService.purge(
            deleting,
            objectStorage,
            mediaAssetRepository,
          );
          collectEvents([MediaEvents.purged(deleting.id, now)]);
        },
      );
      purged += 1;
    } catch (cause) {
      failed += 1;
      const recoverable =
        isStorageUnavailableError(cause) || isStorageNotFoundError(cause);
      logger.error(
        `[media] purge failed for asset ${candidate.id}${recoverable ? " (storage)" : ""}`,
        { mediaAssetId: candidate.id, cause },
      );
    }
  }

  return { purged, failed };
}
