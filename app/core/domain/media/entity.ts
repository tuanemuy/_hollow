import type { WithEventDrafts } from "@/core/domain/common/event";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaErrorCode } from "./errorCode";
import { type MediaEvent, MediaEvents } from "./events";
import {
  MediaAssetId,
  MediaKind,
  MediaStatus,
  MimeType,
  OriginalFileName,
  StorageBackend,
  StorageKey,
  validateByteSize,
  validateDimension,
  validateDurationMs,
  validateRefCount,
} from "./valueObject";

type MediaAssetBase = Readonly<{
  id: MediaAssetId;
  ownerId: UserId;
  kind: MediaKind;
  mimeType: MimeType;
  byteSize: number;
  backend: StorageBackend;
  storageKey: StorageKey;
  originalFileName: OriginalFileName | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}>;

/**
 * Just uploaded; not yet referenced. `refCount === 0` while in this
 * state; the first `incrementRef` (or explicit `markAttached`) moves the
 * asset to `attached`. Abandoning a pending intake transitions directly
 * to `orphan`. For `kind='source'`, `updatedAt` acts as the
 * abandoned-intake age anchor (#468): the sweep worker reclaims pending
 * sources with `updatedAt < now - grace`, so re-stamping `updatedAt` on
 * such a row defers its reclaim.
 */
export type PendingMedia = MediaAssetBase &
  Readonly<{ status: "pending"; refCount: 0 }>;

/** Live asset referenced by at least one consumer (`refCount >= 1`). */
export type AttachedMedia = MediaAssetBase &
  Readonly<{ status: "attached"; refCount: number }>;

/**
 * Ref count reached zero and the asset is awaiting purge. `updatedAt`
 * acts as the orphan age anchor; the purge worker filters by
 * `updatedAt < now - orphanThreshold`.
 */
export type OrphanMedia = MediaAssetBase &
  Readonly<{ status: "orphan"; refCount: 0 }>;

/** Purge in progress; storage delete + DB delete is happening. */
export type DeletingMedia = MediaAssetBase &
  Readonly<{ status: "deleting"; refCount: 0 }>;

export type MediaAsset =
  | PendingMedia
  | AttachedMedia
  | OrphanMedia
  | DeletingMedia;

// Loose-typed because adapters feed untrusted persistence rows; each
// field is re-validated through its value object inside `reconstruct`.
type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  kind: string;
  mimeType: string;
  byteSize: number;
  backend: string;
  storageKey: string;
  originalFileName: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  refCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}>;

type CreateInput = Readonly<{
  id: string;
  ownerId: UserId;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  backend?: StorageBackend;
  storageKey: string;
  originalFileName?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}>;

function markAttached(
  asset: PendingMedia,
  now: Date,
): WithEventDrafts<AttachedMedia, MediaEvent> {
  const next: AttachedMedia = {
    ...asset,
    status: "attached",
    refCount: 1,
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [MediaEvents.attached(next.id, now)],
  };
}

function incrementRef(
  asset: PendingMedia | AttachedMedia,
  now: Date,
): WithEventDrafts<AttachedMedia, MediaEvent> {
  const next: AttachedMedia = {
    ...asset,
    status: "attached",
    refCount: asset.refCount + 1,
    updatedAt: now,
  };
  // `pending → attached` and `attached → attached(refCount + 1)` are
  // both first-class but only the first transition emits `attached`.
  // Subsequent refs are an internal counter change that does not need to
  // wake downstream consumers.
  const drafts =
    asset.status === "pending" ? [MediaEvents.attached(next.id, now)] : [];
  return { entity: next, eventDrafts: drafts };
}

function decrementRef(
  asset: PendingMedia | AttachedMedia,
  now: Date,
): WithEventDrafts<AttachedMedia | OrphanMedia, MediaEvent> {
  if (asset.status === "pending") {
    // Intake abandoned without ever attaching — transition straight to
    // orphan so the purge worker reclaims the bytes.
    const next: OrphanMedia = {
      ...asset,
      status: "orphan",
      refCount: 0,
      updatedAt: now,
    };
    return {
      entity: next,
      eventDrafts: [MediaEvents.orphaned(next.id, now)],
    };
  }

  // attached
  if (asset.refCount <= 0) {
    throw new BusinessRuleError(
      MediaErrorCode.InvariantStatusRefCountMismatch,
      `Attached media ${asset.id} has non-positive refCount`,
    );
  }
  const nextRefCount = asset.refCount - 1;
  if (nextRefCount === 0) {
    const next: OrphanMedia = {
      ...asset,
      status: "orphan",
      refCount: 0,
      updatedAt: now,
    };
    return {
      entity: next,
      eventDrafts: [MediaEvents.orphaned(next.id, now)],
    };
  }
  const next: AttachedMedia = {
    ...asset,
    refCount: nextRefCount,
    updatedAt: now,
  };
  return { entity: next, eventDrafts: [] };
}

function markDeleting(
  asset: OrphanMedia,
  now: Date,
): WithEventDrafts<DeletingMedia, MediaEvent> {
  const next: DeletingMedia = {
    ...asset,
    status: "deleting",
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [MediaEvents.deleting(next.id, now)],
  };
}

function assertOwnedBy(asset: MediaAsset, userId: UserId): void {
  if (asset.ownerId !== userId) {
    throw new BusinessRuleError(
      MediaErrorCode.NotOwned,
      `Media asset ${asset.id} is not owned by ${userId}`,
    );
  }
}

function buildBase(
  input: Omit<ReconstructInput, "refCount" | "status">,
): MediaAssetBase {
  return {
    id: MediaAssetId.create(input.id),
    // `ownerId` is opaque to this domain; trust the caller's branded type
    // at construction (the adapter validates on rehydration via the same
    // brand factory).
    ownerId: input.ownerId as UserId,
    kind: MediaKind.create(input.kind),
    mimeType: MimeType.create(input.mimeType),
    byteSize: validateByteSize(input.byteSize),
    backend: StorageBackend.create(input.backend),
    storageKey: StorageKey.create(input.storageKey),
    originalFileName:
      input.originalFileName === null
        ? null
        : OriginalFileName.create(input.originalFileName),
    width: input.width === null ? null : validateDimension(input.width),
    height: input.height === null ? null : validateDimension(input.height),
    durationMs:
      input.durationMs === null ? null : validateDurationMs(input.durationMs),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function assembleByStatus(
  base: MediaAssetBase,
  status: MediaStatus,
  refCount: number,
): MediaAsset {
  validateRefCount(refCount);
  switch (status) {
    case "pending": {
      if (refCount !== 0) {
        throw new BusinessRuleError(
          MediaErrorCode.InvariantStatusRefCountMismatch,
          `Pending media must have refCount === 0 (got ${refCount})`,
        );
      }
      return { ...base, status, refCount: 0 } satisfies PendingMedia;
    }
    case "attached": {
      if (refCount < 1) {
        throw new BusinessRuleError(
          MediaErrorCode.InvariantStatusRefCountMismatch,
          `Attached media must have refCount >= 1 (got ${refCount})`,
        );
      }
      return { ...base, status, refCount } satisfies AttachedMedia;
    }
    case "orphan": {
      if (refCount !== 0) {
        throw new BusinessRuleError(
          MediaErrorCode.InvariantStatusRefCountMismatch,
          `Orphan media must have refCount === 0 (got ${refCount})`,
        );
      }
      return { ...base, status, refCount: 0 } satisfies OrphanMedia;
    }
    case "deleting": {
      if (refCount !== 0) {
        throw new BusinessRuleError(
          MediaErrorCode.InvariantStatusRefCountMismatch,
          `Deleting media must have refCount === 0 (got ${refCount})`,
        );
      }
      return { ...base, status, refCount: 0 } satisfies DeletingMedia;
    }
  }
}

export const MediaAsset = {
  isPending: (asset: MediaAsset): asset is PendingMedia =>
    asset.status === "pending",
  isAttached: (asset: MediaAsset): asset is AttachedMedia =>
    asset.status === "attached",
  isOrphan: (asset: MediaAsset): asset is OrphanMedia =>
    asset.status === "orphan",
  isDeleting: (asset: MediaAsset): asset is DeletingMedia =>
    asset.status === "deleting",

  create: (
    params: CreateInput,
    now: Date,
  ): WithEventDrafts<PendingMedia, MediaEvent> => {
    const base = buildBase({
      id: params.id,
      ownerId: params.ownerId,
      kind: params.kind,
      mimeType: params.mimeType,
      byteSize: params.byteSize,
      backend: params.backend ?? "r2",
      storageKey: params.storageKey,
      originalFileName: params.originalFileName ?? null,
      width: params.width ?? null,
      height: params.height ?? null,
      durationMs: params.durationMs ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const asset: PendingMedia = { ...base, status: "pending", refCount: 0 };
    return {
      entity: asset,
      eventDrafts: [MediaEvents.created(asset.id, asset.ownerId, now)],
    };
  },

  // Distinguished from `BusinessRuleError` so adapters can map the
  // storage-row-can-no-longer-be-rehydrated case to
  // `SystemError(DataIntegrityError)` while fresh-input validation
  // remains a 4xx user-visible failure. See `Todo.reconstruct` for the
  // full rationale.
  reconstruct: (input: ReconstructInput): MediaAsset => {
    try {
      const base = buildBase(input);
      return assembleByStatus(
        base,
        MediaStatus.create(input.status),
        input.refCount,
      );
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate MediaAsset (id=${input.id})`,
        error,
      );
    }
  },

  markAttached,

  incrementRef,

  decrementRef,

  markDeleting,

  assertOwnedBy,
};
