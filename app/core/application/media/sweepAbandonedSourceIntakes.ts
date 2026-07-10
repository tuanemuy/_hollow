import { MediaAsset } from "@/core/domain/media/entity";
import { MediaService } from "@/core/domain/media/service";
import type { RequestContainer } from "../di/types";

export type SweepAbandonedSourceIntakesOptions = Readonly<{
  /** Grace period before a pending source intake counts as abandoned. */
  graceSec?: number;
  /** Maximum number of intakes to sweep per call. */
  batchSize?: number;
}>;

export type SweepAbandonedSourceIntakesResult = Readonly<{
  swept: number;
  failed: number;
}>;

const DEFAULT_GRACE_SEC = 24 * 60 * 60; // 24h
const DEFAULT_BATCH_SIZE = 100;

/**
 * Cron-driven sweep (#468): find `pending(kind='source')` rows whose
 * grace window has lapsed — intakes created by the commit flow's
 * metadata-first stage that were never attached because the commit
 * failed or rolled back — and orphan them via `decrementRef` so the
 * standard `purgeOrphans` worker reclaims the blob and the row. A
 * source pending is attached within its own commit request, so any that
 * outlives the grace window is abandoned by definition (ADR-004); other
 * kinds are out of scope because their pendings may legitimately await
 * attach.
 *
 * Orphaning re-stamps `updatedAt`, so the actual delete happens only
 * after the orphan grace window lapses too — a deliberate double grace
 * against misclassification. Per-row failures are isolated (logged +
 * counted) so one bad row does not stop the batch; a row that changed
 * state — or was re-stamped back inside the grace window (re-stamping
 * `updatedAt` defers reclaim, see `PendingMedia`) — between candidate
 * listing and its UoW is re-checked fresh and skipped.
 *
 * The fresh re-check closes only the listing → per-row-UoW transition.
 * The deferred-batch UoW gives no isolation between that re-read and the
 * write flush (read-your-write is unsupported by design), so an attach
 * that commits inside that residual window is overwritten by the sweep's
 * orphan. Such an attach is reachable: the commit flow attaches only
 * within the request that created the row (seconds, vs. a 24h grace),
 * but `MediaService.reconcileRefs` rejects only orphan / deleting — a
 * note save whose body references an aged pending source id (owner-
 * visible via `listMediaByOwner`) attaches it regardless of age. Worst
 * case, the orphan overwrite purges a live note's source blob 24h
 * later. Accepted as residual risk: it takes a deliberate embed of an
 * abandoned intake id landing inside the millisecond-scale re-read →
 * flush window of the once-daily tick. Structural closure (rejecting
 * pending sources in `reconcileRefs`) is deferred to a separate issue —
 * see `.issue/468/adr.md`.
 */
export async function sweepAbandonedSourceIntakes(
  container: RequestContainer,
  options: SweepAbandonedSourceIntakesOptions = {},
): Promise<SweepAbandonedSourceIntakesResult> {
  const graceSec = options.graceSec ?? DEFAULT_GRACE_SEC;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const now = container.clock.now();
  const { logger } = container;

  const candidates = await container.unitOfWorkProvider.run(
    async ({ mediaAssetRepository }) =>
      MediaService.listAbandonedSourceIntakes(
        now,
        graceSec,
        mediaAssetRepository,
        batchSize,
      ),
  );

  let swept = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const orphaned = await container.unitOfWorkProvider.run(
        async ({ mediaAssetRepository, collectEvents }) => {
          const fresh = await mediaAssetRepository.findById(candidate.id);
          if (fresh === null) return false;
          // A re-stamped `updatedAt` defers reclaim (see `PendingMedia`),
          // so the abandonment rule must hold for the fresh read too —
          // not just at candidate listing.
          if (!MediaService.isAbandonedSourceIntake(fresh, now, graceSec)) {
            return false;
          }
          const { entity, eventDrafts } = MediaAsset.decrementRef(fresh, now);
          await mediaAssetRepository.save(entity);
          collectEvents(eventDrafts);
          return true;
        },
      );
      if (orphaned) swept += 1;
    } catch (cause) {
      failed += 1;
      logger.error(
        `[media] abandoned source intake sweep failed for asset ${candidate.id}`,
        { mediaAssetId: candidate.id, cause },
      );
    }
  }

  return { swept, failed };
}
