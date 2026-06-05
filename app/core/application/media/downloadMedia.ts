import type { UserId } from "@/core/domain/identity/valueObject";
import {
  isStorageNotFoundError,
  isStorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import { MediaService } from "@/core/domain/media/service";
import type { MediaAssetId, Visibility } from "@/core/domain/media/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { NotFoundError, SystemError, SystemErrorCode } from "../errors";
import type { ServiceArgs } from "../types";

export type DownloadMediaInput = Readonly<{
  viewerUserId: string | null;
  mediaId: string;
  viaShareLinkId: string | null;
  relatedNoteId: string | null;
  // When `true`, presign the URL with an `attachment` content-disposition
  // so the browser saves the object under its original file name instead
  // of rendering it inline. Defaults to inline (preview) behaviour.
  download?: boolean;
}>;

export type DownloadMediaOutput = Readonly<{
  redirectUrl: URL;
}>;

const DOWNLOAD_TTL_SEC = 60;

/**
 * Resolve a short-lived redirect URL for accessing a media asset.
 *
 * Access policy:
 * - Owners can always read their own assets.
 * - Other viewers must supply a `relatedNoteId` whose `PublicationState`
 *   is `public` (or `unlisted` — in which case the caller is responsible
 *   for having validated the share-link out of band via
 *   `Publication.ResolveShareLink` and passing `viaShareLinkId`).
 *
 * The share-link validation is intentionally NOT re-run here: the caller
 * (presentation) owns the resolve flow and threads a verified
 * `viaShareLinkId` in; this usecase just records the chain for audit.
 */
export async function downloadMedia({
  container,
  input,
}: ServiceArgs<DownloadMediaInput>): Promise<DownloadMediaOutput> {
  const { asset, relatedVisibility } = await container.unitOfWorkProvider.run(
    async ({ mediaAssetRepository, publicationStateRepository }) => {
      const fetched = await mediaAssetRepository.findById(
        input.mediaId as MediaAssetId,
      );
      if (fetched === null) {
        throw new NotFoundError(
          "MEDIA_NOT_FOUND",
          `Media asset not found: ${input.mediaId}`,
        );
      }
      let visibility: Visibility | null = null;
      if (input.relatedNoteId !== null) {
        const found = await publicationStateRepository.findById(
          input.relatedNoteId as NoteId,
        );
        if (found !== null) {
          visibility = found.entity.visibility as Visibility;
        }
      }
      return { asset: fetched, relatedVisibility: visibility };
    },
  );

  MediaService.assertViewableBy({
    asset,
    viewerOwnerId: input.viewerUserId as UserId | null,
    relatedNoteVisibility: relatedVisibility,
    hasShareLink: input.viaShareLinkId !== null,
  });

  const downloadFileName =
    input.download === true ? (asset.originalFileName ?? asset.id) : undefined;
  const redirectUrl = await safePresign(() =>
    container.objectStorage.presignDownload(
      asset.storageKey,
      DOWNLOAD_TTL_SEC,
      downloadFileName === undefined ? undefined : { downloadFileName },
    ),
  );

  return { redirectUrl };
}

async function safePresign<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    if (isStorageNotFoundError(cause)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        cause.message,
        cause,
      );
    }
    if (isStorageUnavailableError(cause)) {
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        cause.message,
        cause,
      );
    }
    throw cause;
  }
}
