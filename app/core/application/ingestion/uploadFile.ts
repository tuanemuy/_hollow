import { BusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import { IngestionJob } from "@/core/domain/ingestion/entity";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import { IngestionService } from "@/core/domain/ingestion/service";
import { IngestionLimits } from "@/core/domain/ingestion/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import type { IngestionJobId } from "../dto/ingestion";
import type { ServiceArgs } from "../types";

export type UploadFileInput = Readonly<{
  actorUserId: UserIdDTO;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  bodyStream: ReadableStream<Uint8Array>;
}>;

export type UploadFileOutput = Readonly<{
  jobId: IngestionJobId;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function uploadFile({
  container,
  input,
}: ServiceArgs<UploadFileInput>): Promise<UploadFileOutput> {
  const now = container.clock.now();
  const actorUserId = UserId.create(input.actorUserId);
  const id = container.idGenerator.next();

  if (input.byteSize === 0) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidByteSize,
      "Empty file: byteSize must be greater than zero",
    );
  }

  // Drain the upload first so adapter-side put can receive a single
  // ArrayBuffer. R2 has no native streaming append, so this matches the
  // pattern used by `uploadMedia`.
  const bytes = await readStreamAsArrayBuffer(input.bodyStream);
  if (bytes.byteLength !== input.byteSize) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidByteSize,
      `Body length (${bytes.byteLength}) does not match declared byteSize (${input.byteSize})`,
    );
  }

  const kind = IngestionService.detectKind(
    input.mimeType,
    input.originalFileName,
  );
  const tempStorageKey = buildTempStorageKey(actorUserId, id);

  const jobId = await container.unitOfWorkProvider.run(
    async ({
      ingestionJobRepository,
      instanceSettingsRepository,
      collectEvents,
    }) => {
      const { entity: settings } = await instanceSettingsRepository.get();
      const limits = ingestionLimitsFromSettings(settings.limits);

      IngestionService.assertWithinLimits(kind, input.byteSize, limits);

      const since = new Date(now.getTime() - DAY_MS);
      const sumSoFar = await ingestionJobRepository.sumByteSizeByOwnerSince(
        actorUserId,
        since,
      );
      if (sumSoFar + input.byteSize > settings.limits.maxUploadBytesPerDay) {
        throw new BusinessRuleError(
          IngestionErrorCode.DailyUploadQuotaExceeded,
          `Daily upload quota exceeded (used=${sumSoFar} new=${input.byteSize} cap=${settings.limits.maxUploadBytesPerDay})`,
        );
      }

      const { entity: job, eventDrafts } = IngestionJob.create(
        {
          id,
          ownerId: actorUserId,
          originalFileName: input.originalFileName,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          kind,
          tempStorageKey,
        },
        now,
      );

      await ingestionJobRepository.insert(job);
      // Stage the body inside the UoW so a failed persistence rolls back
      // before another worker could observe an orphan temp blob. The
      // adapter contract treats `put` as overwrite-safe, so a retry of
      // the same job id never leaks bytes.
      await container.tempFileStorage.put(tempStorageKey, bytes);
      collectEvents(eventDrafts);
      return job.id;
    },
  );

  return { jobId: jobId as unknown as IngestionJobId };
}

function ingestionLimitsFromSettings(limits: {
  readonly maxIngestionBytes: number;
}): IngestionLimits {
  return IngestionLimits.create({
    defaultMaxBytes: limits.maxIngestionBytes,
    maxRegenerations: 5,
  });
}

function buildTempStorageKey(ownerId: UserId, jobId: string): string {
  return `${ownerId}/ingestion/${jobId}`;
}

async function readStreamAsArrayBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<ArrayBuffer> {
  const response = new Response(stream);
  return response.arrayBuffer();
}
