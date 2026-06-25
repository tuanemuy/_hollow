import type { UserId } from "@/core/domain/identity/valueObject";
import { TagMergeJob } from "@/core/domain/tag/mergeJob/entity";
import { TagService } from "@/core/domain/tag/service";
import type { TagId as DomainTagId } from "@/core/domain/tag/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type TagMergeJobDTO, toTagMergeJobView } from "./view";

export type EnqueueTagMergeJobInput = Readonly<{
  actorUserId: string;
  sourceTagId: string;
  targetTagId: string;
}>;

export type EnqueueTagMergeJobOutput = Readonly<{
  job: TagMergeJobDTO;
}>;

/**
 * Validates a tag merge request and persists it as a `pending`
 * `TagMergeJob`, emitting `tag.merge.requested` so the queue consumer
 * picks it up for `runTagMergeJob`. The request returns immediately with
 * the job DTO; the actual note rewriting happens asynchronously.
 *
 * Duplicate-merge suppression is intentionally absent (plan coverage
 * S-002): tag merges are idempotent and re-runnable, so a hard
 * `BusinessRuleError` guard on an existing active job would block the only
 * recovery path (the user re-merging) for a stuck job.
 */
export async function enqueueTagMergeJob({
  container,
  input,
}: ServiceArgs<EnqueueTagMergeJobInput>): Promise<EnqueueTagMergeJobOutput> {
  const now = container.clock.now();
  const id = container.idGenerator.next();
  const actorUserId = input.actorUserId as UserId;

  const job = await container.unitOfWorkProvider.run(
    async ({ tagRepository, tagMergeJobRepository, collectEvents }) => {
      const sourceFound = await tagRepository.findById(input.sourceTagId);
      if (!sourceFound) {
        throw new NotFoundError(
          "TAG_NOT_FOUND",
          `Tag not found: ${input.sourceTagId}`,
        );
      }
      const targetFound = await tagRepository.findById(input.targetTagId);
      if (!targetFound) {
        throw new NotFoundError(
          "TAG_NOT_FOUND",
          `Tag not found: ${input.targetTagId}`,
        );
      }
      if (
        (sourceFound.entity.ownerId as string) !== input.actorUserId ||
        (targetFound.entity.ownerId as string) !== input.actorUserId
      ) {
        throw new ForbiddenError(
          "TAG_OWNER_MISMATCH",
          "Tags are not owned by the actor",
        );
      }

      // Validate the merge plan (owner match, distinct tags). Rejecting
      // here means no job row is created for an invalid request.
      TagService.computeMergePlan(sourceFound.entity, targetFound.entity);

      const { entity, eventDrafts } = TagMergeJob.create(
        {
          id,
          ownerId: actorUserId,
          sourceTagId: sourceFound.entity.id as DomainTagId,
          targetTagId: targetFound.entity.id as DomainTagId,
        },
        now,
      );
      await tagMergeJobRepository.insert(entity);
      collectEvents(eventDrafts);
      return entity;
    },
  );

  return { job: toTagMergeJobView(job) };
}
