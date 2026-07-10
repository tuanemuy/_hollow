import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaAsset } from "@/core/domain/media/entity";
import { MediaErrorCode } from "@/core/domain/media/errorCode";
import {
  isStorageNotFoundError,
  isStorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import type { MediaKind } from "@/core/domain/media/valueObject";
import { SystemError, SystemErrorCode } from "../errors";
import type { ServiceArgs } from "../types";

export type UploadMediaInput = Readonly<{
  actorUserId: UserId;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  bodyStream: ReadableStream<Uint8Array>;
  originalFileName: string | null;
}>;

export type UploadMediaOutput = Readonly<{
  mediaId: string;
  downloadUrl: URL;
}>;

const DOWNLOAD_TTL_SEC = 15 * 60;

/**
 * Direct upload entry point: streams bytes through the worker into R2,
 * persists the `MediaAsset` row in `pending` state, and returns a
 * presigned download URL.
 *
 * Storage and metadata are deliberately split across the UoW boundary —
 * R2 has no two-phase commit, so this path uploads the bytes first and
 * persists metadata after. If metadata persistence fails, the blob is
 * left behind with no `MediaAsset` row, and the DB-driven purge pipeline
 * cannot reach it — an accepted edge since #452. Reclaiming it would
 * require the metadata-first ordering used by the ingestion commit flow
 * (#468 ADR-002).
 */
export async function uploadMedia({
  container,
  input,
}: ServiceArgs<UploadMediaInput>): Promise<UploadMediaOutput> {
  const now = container.clock.now();
  const id = container.idGenerator.next();

  const bytes = await readStreamAsArrayBuffer(input.bodyStream);
  if (bytes.byteLength !== input.byteSize) {
    throw new BusinessRuleError(
      MediaErrorCode.ByteSizeMismatch,
      `Body length (${bytes.byteLength}) does not match declared byteSize (${input.byteSize})`,
    );
  }

  const storageKey = buildStorageKey(input.actorUserId, input.kind, id);

  await container.unitOfWorkProvider.run(
    async ({ mediaAssetRepository, instanceSettingsRepository }) => {
      const { entity: settings } = await instanceSettingsRepository.get();
      enforceUploadLimit(input.kind, input.byteSize, settings.limits);

      await safeStoragePut(() =>
        container.objectStorage.put(storageKey, bytes, input.mimeType),
      );

      const { entity: asset } = MediaAsset.create(
        {
          id,
          ownerId: input.actorUserId,
          kind: input.kind,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          storageKey,
          originalFileName: input.originalFileName,
        },
        now,
      );

      await mediaAssetRepository.save(asset);
      // Intentionally no `collectEvents` here — `MediaAsset.create`
      // emits `media.created`, but the spec stages the asset as
      // `pending` with `refCount=0` and only surfaces it to consumers
      // once it is referenced. The downstream attach/orphan/purge
      // events drive the lifecycle; firing `media.created` here would
      // wake subscribers on every transient intake.
    },
  );

  const downloadUrl = await container.objectStorage.presignDownload(
    storageKey,
    DOWNLOAD_TTL_SEC,
  );

  return { mediaId: id, downloadUrl };
}

export function buildStorageKey(
  userId: UserId,
  kind: MediaKind,
  id: string,
): string {
  return `${userId}/${kind}/${id}`;
}

/**
 * Per-asset upload cap, sourced from `InstanceLimits.maxNoteBytes`.
 * Future tightening per kind (image vs video) can land here without
 * changing the call site.
 */
export function enforceUploadLimit(
  kind: MediaKind,
  byteSize: number,
  limits: { readonly maxNoteBytes: number },
): void {
  if (byteSize <= 0) {
    throw new BusinessRuleError(
      MediaErrorCode.InvalidByteSize,
      `Invalid byte size for ${kind}: ${byteSize}`,
    );
  }
  if (byteSize > limits.maxNoteBytes) {
    throw new BusinessRuleError(
      MediaErrorCode.ByteSizeExceeded,
      `Asset (${byteSize} B) exceeds limit (${limits.maxNoteBytes} B) for ${kind}`,
    );
  }
}

async function readStreamAsArrayBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<ArrayBuffer> {
  const response = new Response(stream);
  return response.arrayBuffer();
}

export async function safeStoragePut(
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (cause) {
    if (isStorageUnavailableError(cause) || isStorageNotFoundError(cause)) {
      throw new SystemError(
        SystemErrorCode.ExternalApiError,
        cause.message,
        cause,
      );
    }
    throw cause;
  }
}
