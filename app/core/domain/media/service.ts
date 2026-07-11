import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaAsset, type PendingMedia } from "./entity";
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
 * Returns purge candidates whose `updatedAt` is older than `now - ageSec`:
 * fresh `orphan` rows and `deleting` rows whose earlier purge stalled.
 * The adapter implements the status filter; this wrapper expresses the
 * domain-level grace window, which doubles as the retry interval for
 * stalled `deleting` rows.
 */
async function listPurgeCandidates(
  now: Date,
  ageSec: number,
  repo: MediaAssetRepository,
  limit = 100,
): Promise<readonly MediaAsset[]> {
  const cutoff = new Date(now.getTime() - ageSec * 1000);
  return repo.findPurgeableOlderThan(cutoff, limit);
}

function abandonedSourceIntakeCutoff(now: Date, graceSec: number): Date {
  return new Date(now.getTime() - graceSec * 1000);
}

/**
 * Single source of the abandoned-source-intake rule (#468 ADR-002 /
 * ADR-004): `pending` ∧ `kind='source'` ∧ `updatedAt` strictly older
 * than `now - graceSec`. A source pending is attached within its own
 * commit request, so any that outlives the grace window was abandoned
 * by a rolled-back or failed commit. `listAbandonedSourceIntakes`
 * expresses the same rule as a bulk query; the sweep worker's per-row
 * fresh guard re-applies it here.
 *
 * Deliberately `boolean`, not `asset is PendingMedia`: the rule hinges
 * on value conditions (kind, elapsed time) beyond the `status`
 * discriminant, so a type predicate would unsoundly narrow the false
 * branch (an in-grace pending source is not `AttachedMedia | ...`).
 * Callers needing `PendingMedia` should combine with
 * `MediaAsset.isPending`.
 */
function isAbandonedSourceIntake(
  asset: MediaAsset,
  now: Date,
  graceSec: number,
): boolean {
  return (
    MediaAsset.isPending(asset) &&
    asset.kind === "source" &&
    asset.updatedAt.getTime() <
      abandonedSourceIntakeCutoff(now, graceSec).getTime()
  );
}

/**
 * Returns abandoned source intakes per `isAbandonedSourceIntake`.
 * Symmetric with `listPurgeCandidates` — the grace window is a domain
 * rule owned here; the adapter only implements the status/kind filter.
 */
async function listAbandonedSourceIntakes(
  now: Date,
  graceSec: number,
  repo: MediaAssetRepository,
  limit = 100,
): Promise<readonly PendingMedia[]> {
  return repo.findAbandonedSourceIntakes(
    abandonedSourceIntakeCutoff(now, graceSec),
    limit,
  );
}

/**
 * Storage delete + DB delete. Caller is expected to have transitioned
 * the asset to `deleting` already; this service finalises the purge.
 * Storage errors are NOT swallowed — they propagate so the orchestrator
 * (`purgeOrphans`) can log + count the failure and leave the row in
 * `deleting` for a later sweep to retry. Note the `ObjectStorage.delete`
 * contract: a missing key is success, never `StorageNotFoundError`, so
 * a row without a backing blob (e.g. a commit whose `put` failed, #468)
 * still purges to completion. The storage delete runs first so a failed
 * R2 delete never orphans the row's bytes behind a missing DB record.
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
 * anonymous viewers the related note must be `public`, or — when the
 * related note is `unlisted` — the caller must additionally signal that a
 * share link has already been validated out of band by passing
 * `hasShareLink: true`. `hasShareLink` is intentionally non-optional so
 * every call site is forced to declare its share-link state at the type
 * level.
 */
function assertViewableBy(args: {
  asset: MediaAsset;
  viewerOwnerId: UserId | null;
  relatedNoteVisibility: Visibility | null;
  hasShareLink: boolean;
}): void {
  const { asset, viewerOwnerId, relatedNoteVisibility, hasShareLink } = args;
  if (viewerOwnerId !== null && viewerOwnerId === asset.ownerId) {
    return;
  }
  if (relatedNoteVisibility === "public") {
    return;
  }
  if (relatedNoteVisibility === "unlisted" && hasShareLink) {
    return;
  }
  throw new BusinessRuleError(
    MediaErrorCode.NotViewable,
    `Media asset ${asset.id} is not viewable by ${viewerOwnerId ?? "anonymous"}`,
  );
}

export const MediaService = {
  reconcileRefs,
  listPurgeCandidates,
  isAbandonedSourceIntake,
  listAbandonedSourceIntakes,
  purge,
  assertViewableBy,
};
