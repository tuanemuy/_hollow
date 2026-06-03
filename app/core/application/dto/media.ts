import type { MediaAsset } from "@/core/domain/media/entity";
import type { Instant } from "./common";
import { toInstant } from "./common";
import type { MediaAssetId, UserId } from "./identity";

/**
 * Media asset projection.
 *
 * The domain entity carries fields the presentation layer never needs
 * (backend, storageKey, refCount, status) — they are stripped here. The
 * caller materialises `downloadUrl` from `storageKey` via the storage
 * adapter (signed URL or public route, depending on visibility).
 */
export type MediaAssetDTO = Readonly<{
  id: MediaAssetId;
  ownerId: UserId;
  kind: "image" | "video" | "avatar" | "source";
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  downloadUrl: string;
  createdAt: Instant;
}>;

export function toMediaAssetDTO(
  asset: MediaAsset,
  downloadUrl: string,
): MediaAssetDTO {
  return {
    id: asset.id as unknown as MediaAssetId,
    ownerId: asset.ownerId as unknown as UserId,
    kind: asset.kind,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    downloadUrl,
    createdAt: toInstant(asset.createdAt),
  };
}
