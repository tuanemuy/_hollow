import { ExportJob } from "@/core/domain/export/entity";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";

export type HandleUserDeletedEventInput = Readonly<{
  userId: UserId;
}>;

export type HandleUserDeletedEventOutput = Readonly<{
  cancelled: number;
}>;

const BATCH_LIMIT = 100;

/**
 * `user.deleted` event handler. Cancels every active export job owned
 * by the deleted user and best-effort deletes the underlying artifacts.
 * The loop reads in pages so a single user with a large export history
 * does not pull every job into one UoW.
 */
export async function handleUserDeletedEvent({
  container,
  input,
}: ServiceArgs<HandleUserDeletedEventInput>): Promise<HandleUserDeletedEventOutput> {
  const now = container.clock.now();
  let cancelled = 0;
  let offset = 0;

  while (true) {
    const page = await container.unitOfWorkProvider.run(
      async ({ exportJobRepository }) =>
        exportJobRepository.findByOwner(input.userId, {
          limit: BATCH_LIMIT,
          offset,
          order: "desc",
        }),
    );
    if (page.length === 0) break;

    for (const job of page) {
      try {
        const result = await container.unitOfWorkProvider.run(
          async ({ exportJobRepository, collectEvents }) => {
            const found = await exportJobRepository.findById(job.id);
            if (found === null) return { artifactKey: null as string | null };
            if (
              !ExportJob.isPending(found.entity) &&
              !ExportJob.isProcessing(found.entity) &&
              !ExportJob.isCompleted(found.entity)
            ) {
              return { artifactKey: null as string | null };
            }
            const completedKey = ExportJob.isCompleted(found.entity)
              ? found.entity.artifactKey
              : null;
            if (ExportJob.isCompleted(found.entity)) {
              // Completed jobs are terminal for `cancel`; transition via
              // `expire` instead so the artifact key flows through the
              // same deletion path.
              const { entity, eventDrafts } = ExportJob.expire(
                found.entity,
                now,
              );
              await exportJobRepository.save(entity, found.expectedVersion);
              collectEvents(eventDrafts);
            } else {
              const { entity, eventDrafts } = ExportJob.cancel(
                found.entity,
                now,
              );
              await exportJobRepository.save(entity, found.expectedVersion);
              collectEvents(eventDrafts);
            }
            return { artifactKey: completedKey };
          },
        );
        if (result.artifactKey !== null) {
          try {
            await container.objectStorage.delete(result.artifactKey);
          } catch (error) {
            container.logger.warn(
              `[export] failed to delete artifact during user deletion: ${result.artifactKey}`,
              { jobId: job.id, cause: error },
            );
          }
        }
        cancelled += 1;
      } catch (error) {
        container.logger.error(
          "[export] failed to cancel export job during user deletion",
          { jobId: job.id, userId: input.userId, cause: error },
        );
      }
    }

    if (page.length < BATCH_LIMIT) break;
    offset += page.length;
  }

  return { cancelled };
}
