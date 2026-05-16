import type { MediaAsset } from "@/core/domain/media/entity";
import type { ObjectStorage } from "@/core/domain/media/ports/objectStorage";
import { type MediaAssetDTO, toMediaAssetDTO } from "../dto/media";

export type { MediaAssetDTO } from "../dto/media";

/**
 * Short-lived presigned download TTL used for listing / detail projections.
 * Kept on the high end (15 min) so cached responses stay valid through a
 * typical SSR + client navigation cycle. Adjust at the call site for
 * stricter share-link flows (`DownloadMedia`).
 */
export const DEFAULT_DOWNLOAD_TTL_SEC = 15 * 60;

/**
 * Project a `MediaAsset` to its DTO, materialising a presigned download
 * URL from the object-storage adapter. The URL is short-lived; callers
 * that intend to surface a stable URL should keep the projection close
 * to the response boundary (no caching across requests).
 */
export async function projectMediaAsset(
  asset: MediaAsset,
  storage: ObjectStorage,
  ttlSec: number = DEFAULT_DOWNLOAD_TTL_SEC,
): Promise<MediaAssetDTO> {
  const url = await storage.presignDownload(asset.storageKey, ttlSec);
  return toMediaAssetDTO(asset, url.toString());
}
