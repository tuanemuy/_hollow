import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaErrorCode } from "@/core/domain/media/errorCode";
import {
  isStorageNotFoundError,
  isStorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import {
  type MediaAssetId,
  MimeType,
  validateByteSize,
} from "@/core/domain/media/valueObject";
import { NotFoundError, SystemError, SystemErrorCode } from "../errors";
import type { ServiceArgs } from "../types";

export type FinalizeUploadInput = Readonly<{
  actorUserId: UserId;
  mediaId: MediaAssetId;
}>;

export type FinalizeUploadOutput = Readonly<{
  mediaId: MediaAssetId;
  byteSize: number;
  mimeType: string;
}>;

/**
 * Confirm a presigned upload landed by reading R2's head metadata and
 * reconciling the persisted `MediaAsset` row.
 *
 * Only owners can finalise their own intake. Missing R2 objects (the
 * client never PUT against the presigned URL) surface as
 * `SystemError(DataIntegrityError)` — the row exists in DB but the
 * backing bytes do not, which is an integrity break the client cannot
 * fix on its own.
 */
export async function finalizeUpload({
  container,
  input,
}: ServiceArgs<FinalizeUploadInput>): Promise<FinalizeUploadOutput> {
  const now = container.clock.now();

  const asset = await container.unitOfWorkProvider.run(
    async ({ mediaAssetRepository }) =>
      mediaAssetRepository.findById(input.mediaId),
  );
  if (asset === null) {
    throw new NotFoundError(
      "MEDIA_NOT_FOUND",
      `Media asset not found: ${input.mediaId}`,
    );
  }
  if (asset.ownerId !== input.actorUserId) {
    throw new BusinessRuleError(
      MediaErrorCode.NotOwned,
      `Media asset ${asset.id} is not owned by ${input.actorUserId}`,
    );
  }

  const meta = await safeStat(() =>
    container.objectStorage.stat(asset.storageKey),
  );

  const headByteSize = validateByteSize(meta.byteSize);
  const headMimeType = MimeType.create(meta.contentType);

  await container.unitOfWorkProvider.run(async ({ mediaAssetRepository }) => {
    const fresh = await mediaAssetRepository.findById(input.mediaId);
    if (fresh === null) {
      throw new NotFoundError(
        "MEDIA_NOT_FOUND",
        `Media asset not found: ${input.mediaId}`,
      );
    }
    const next = {
      ...fresh,
      byteSize: headByteSize,
      mimeType: headMimeType,
      updatedAt: now,
    };
    await mediaAssetRepository.save(next);
  });

  return {
    mediaId: asset.id,
    byteSize: headByteSize,
    mimeType: headMimeType,
  };
}

async function safeStat<T>(action: () => Promise<T>): Promise<T> {
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
