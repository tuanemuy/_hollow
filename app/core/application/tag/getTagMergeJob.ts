import type { UserId as UserIdBrand } from "@/core/domain/identity/valueObject";
import { TagMergeJob } from "@/core/domain/tag/mergeJob/entity";
import type { TagMergeJobId as TagMergeJobIdBrand } from "@/core/domain/tag/mergeJob/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type TagMergeJobDTO, toTagMergeJobView } from "./view";

export type GetTagMergeJobInput = Readonly<{
  actorUserId: string;
  jobId: string;
}>;

export type GetTagMergeJobOutput = Readonly<{
  job: TagMergeJobDTO;
}>;

/**
 * Read-only fetch with ownership check, used by the `MergeTagDialog`
 * progress poller. The client polls a `jobId` held in its own state, so
 * `assertOwnedBy` is mandatory here to prevent an IDOR — without it a
 * caller could read another owner's job (progress + source/target tag ids)
 * by guessing its id (`getExportJob` parity, AC-8).
 */
export async function getTagMergeJob({
  container,
  input,
}: ServiceArgs<GetTagMergeJobInput>): Promise<GetTagMergeJobOutput> {
  const job = await container.unitOfWorkProvider.run(
    async ({ tagMergeJobRepository }) => {
      const found = await tagMergeJobRepository.findById(
        input.jobId as TagMergeJobIdBrand,
      );
      if (found === null) {
        throw new NotFoundError(
          "TAG_MERGE_JOB_NOT_FOUND",
          `Tag merge job not found: ${input.jobId}`,
        );
      }
      TagMergeJob.assertOwnedBy(found.entity, input.actorUserId as UserIdBrand);
      return found.entity;
    },
  );
  return { job: toTagMergeJobView(job) };
}
