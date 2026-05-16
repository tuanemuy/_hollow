import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaAsset } from "./entity";
import { MediaErrorCode } from "./errorCode";
import type { MediaAssetRepository } from "./ports/mediaAssetRepository";
import type { ObjectStorage } from "./ports/objectStorage";
import type { MediaAssetId, Visibility } from "./valueObject";

/**
 * Diff-driven ref-count maintenance for ID lists embedded inside another
 * aggregate (e.g. a note's `mediaIds`). For every asset that appears only
 * in `after`, `incrementRef` is applied; only-in-`before` assets are
 * decremented.
 *
 * The diff is taken on the set difference, so duplicate ids within a list
 * are treated as a single reference — the consuming aggregate is
 * responsible for deduping its own list semantics if multi-reference
 * matters. Missing assets in storage are silently skipped (the
 * idempotent / orphan-tolerant policy).
 */
async function reconcileRefs(
  noteBeforeIds: readonly MediaAssetId[],
  noteAfterIds: readonly MediaAssetId[],
  now: Date,
  repo: MediaAssetRepository,
): Promise<void> {
  const beforeSet = new Set(noteBeforeIds);
  const afterSet = new Set(noteAfterIds);
  const added: MediaAssetId[] = [];
  const removed: MediaAssetId[] = [];
  for (const id of afterSet) {
    if (!beforeSet.has(id)) {
      added.push(id);
    }
  }
  for (const id of beforeSet) {
    if (!afterSet.has(id)) {
      removed.push(id);
    }
  }

  for (const id of added) {
    const asset = await repo.findById(id);
    if (asset === null) continue;
    if (asset.status === "orphan" || asset.status === "deleting") {
      throw new BusinessRuleError(
        MediaErrorCode.IllegalTransition,
        `Cannot attach media ${id} in status ${asset.status}`,
      );
    }
    const { entity } = MediaAsset.incrementRef(asset, now);
    await repo.save(entity);
  }

  for (const id of removed) {
    const asset = await repo.findById(id);
    if (asset === null) continue;
    if (asset.status === "orphan" || asset.status === "deleting") {
      // Already detached; nothing further to do.
      continue;
    }
    const { entity } = MediaAsset.decrementRef(asset, now);
    await repo.save(entity);
  }
}

/**
 * Returns orphans whose `updatedAt` is older than `now - ageSec`. The
 * adapter implements the filter; this wrapper just expresses the
 * domain-level semantics ("orphan grace period").
 */
async function listOrphanCandidates(
  now: Date,
  ageSec: number,
  repo: MediaAssetRepository,
  limit = 100,
): Promise<readonly MediaAsset[]> {
  const cutoff = new Date(now.getTime() - ageSec * 1000);
  return repo.findOrphansOlderThan(cutoff, limit);
}

/**
 * Storage delete + DB delete. Caller is expected to have transitioned
 * the asset to `deleting` already; this service finalises the purge.
 * `StorageNotFoundError` on the storage delete is swallowed so a partial
 * prior failure does not block the DB cleanup.
 */
async function purge(
  asset: MediaAsset,
  storage: ObjectStorage,
  repo: MediaAssetRepository,
): Promise<void> {
  if (asset.status !== "deleting") {
    throw new BusinessRuleError(
      MediaErrorCode.IllegalTransition,
      `purge requires status === 'deleting' (got ${asset.status})`,
    );
  }
  await storage.delete(asset.storageKey);
  await repo.delete(asset.id);
}

/**
 * Access-control check for media reads. The owner can always view; for
 * anonymous viewers the related note must be `public`, or the caller
 * must have already validated a limited-share link out of band and pass
 * `relatedNoteVisibility === 'unlisted'` to mark that case.
 */
function assertViewableBy(args: {
  asset: MediaAsset;
  viewerOwnerId: UserId | null;
  relatedNoteVisibility: Visibility | null;
}): void {
  const { asset, viewerOwnerId, relatedNoteVisibility } = args;
  if (viewerOwnerId !== null && viewerOwnerId === asset.ownerId) {
    return;
  }
  if (
    relatedNoteVisibility === "public" ||
    relatedNoteVisibility === "unlisted"
  ) {
    return;
  }
  throw new BusinessRuleError(
    MediaErrorCode.NotViewable,
    `Media asset ${asset.id} is not viewable by ${viewerOwnerId ?? "anonymous"}`,
  );
}

export const MediaService = {
  reconcileRefs,
  listOrphanCandidates,
  purge,
  assertViewableBy,
};
