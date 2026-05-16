import { ExportJob } from "@/core/domain/export/entity";
import type { ServiceArgs } from "../types";

export type PurgeExpiredExportsInput = Readonly<{
  limit?: number;
}>;

export type PurgeExpiredExportsOutput = Readonly<{
  expired: number;
}>;

const DEFAULT_LIMIT = 100;

/**
 * Batch transition completed-but-expired export jobs to `expired` and
 * remove their artifacts. The repository's `findExpired` returns only
 * jobs whose `expiresAt < now`; the loop handles per-row failures so a
 * single stuck artifact does not block the rest of the batch.
 */
export async function purgeExpiredExports({
  container,
  input,
}: ServiceArgs<PurgeExpiredExportsInput>): Promise<PurgeExpiredExportsOutput> {
  const now = container.clock.now();
  const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);

  const candidates = await container.unitOfWorkProvider.run(
    async ({ exportJobRepository }) =>
      exportJobRepository.findExpired(now, limit),
  );

  let expired = 0;
  for (const candidate of candidates) {
    if (!ExportJob.isCompleted(candidate)) continue;
    try {
      const { artifactKey } = await container.unitOfWorkProvider.run(
        async ({ exportJobRepository, collectEvents }) => {
          const found = await exportJobRepository.findById(candidate.id);
          if (found === null) {
            return { artifactKey: null as string | null };
          }
          if (!ExportJob.isCompleted(found.entity)) {
            return { artifactKey: null as string | null };
          }
          const { entity, eventDrafts } = ExportJob.expire(found.entity, now);
          await exportJobRepository.save(entity, found.expectedVersion);
          collectEvents(eventDrafts);
          return { artifactKey: entity.artifactKey };
        },
      );
      if (artifactKey !== null) {
        try {
          await container.objectStorage.delete(artifactKey);
        } catch (error) {
          container.logger.warn(
            `[export] failed to delete expired artifact: ${artifactKey}`,
            { jobId: candidate.id, cause: error },
          );
        }
      }
      expired += 1;
    } catch (error) {
      container.logger.error(`[export] failed to expire job ${candidate.id}`, {
        jobId: candidate.id,
        cause: error,
      });
    }
  }

  return { expired };
}
