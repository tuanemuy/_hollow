import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaAsset } from "@/core/domain/media/entity";
import type { ServiceArgs } from "../types";
import {
  buildStorageKey,
  enforceUploadLimit,
  type UploadableMediaKind,
} from "./uploadMedia";

export type UploadMediaPresignedInput = Readonly<{
  actorUserId: string;
  kind: UploadableMediaKind;
  mimeType: string;
  byteSize: number;
}>;

export type UploadMediaPresignedOutput = Readonly<{
  mediaId: string;
  uploadUrl: URL;
  expectedDownloadUrl: URL;
}>;

const UPLOAD_TTL_SEC = 10 * 60;
const DOWNLOAD_TTL_SEC = 15 * 60;

/**
 * Pre-create the `MediaAsset` row in `pending` state and mint a
 * short-lived presigned upload URL the client can PUT to directly.
 *
 * The client follows up with `FinalizeUpload` once R2 ACKs the PUT; if
 * it never does, the row stays `pending` with `refCount=0`. Such rows
 * are currently NOT reclaimed automatically: the purge pipeline only
 * targets `orphan` / `deleting` rows, and the abandoned-intake sweep is
 * deliberately limited to `kind='source'` because an image / video
 * pending may legitimately be awaiting attach from an open editor draft
 * (#468 ADR-004).
 */
export async function uploadMediaPresigned({
  container,
  input,
}: ServiceArgs<UploadMediaPresignedInput>): Promise<UploadMediaPresignedOutput> {
  const now = container.clock.now();
  const actorUserId = input.actorUserId as UserId;
  const id = container.idGenerator.next();
  const storageKey = buildStorageKey(actorUserId, input.kind, id);

  await container.unitOfWorkProvider.run(
    async ({ mediaAssetRepository, instanceSettingsRepository }) => {
      const { entity: settings } = await instanceSettingsRepository.get();
      enforceUploadLimit(input.kind, input.byteSize, settings.limits);

      const { entity: asset } = MediaAsset.create(
        {
          id,
          ownerId: actorUserId,
          kind: input.kind,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          storageKey,
          originalFileName: null,
        },
        now,
      );
      await mediaAssetRepository.save(asset);
    },
  );

  const uploadUrl = await container.objectStorage.presignUpload(
    storageKey,
    input.mimeType,
    UPLOAD_TTL_SEC,
  );
  const expectedDownloadUrl = await container.objectStorage.presignDownload(
    storageKey,
    DOWNLOAD_TTL_SEC,
  );

  return { mediaId: id, uploadUrl, expectedDownloadUrl };
}
