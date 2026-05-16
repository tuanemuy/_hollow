import { UserId } from "@/core/domain/identity/valueObject";
import { IngestionStatus } from "@/core/domain/ingestion/valueObject";
import type { UserId as UserIdDTO } from "../dto/identity";
import type { ServiceArgs } from "../types";
import { type IngestionJobView, toIngestionJobView } from "./view";

export type GetIngestionJobsInput = Readonly<{
  actorUserId: UserIdDTO;
  limit?: number;
  offset?: number;
  status?: string;
  order?: "asc" | "desc";
}>;

export type GetIngestionJobsOutput = Readonly<{
  jobs: readonly IngestionJobView[];
}>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function getIngestionJobs({
  container,
  input,
}: ServiceArgs<GetIngestionJobsInput>): Promise<GetIngestionJobsOutput> {
  const actor = UserId.create(input.actorUserId);
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT);
  const offset =
    input.offset !== undefined && input.offset >= 0
      ? Math.floor(input.offset)
      : 0;
  const status =
    input.status === undefined
      ? undefined
      : IngestionStatus.create(input.status);

  const jobs = await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository }) => {
      return ingestionJobRepository.findByOwner(actor, {
        limit,
        offset,
        ...(status === undefined ? {} : { status }),
        order: input.order ?? "desc",
      });
    },
  );

  return { jobs: jobs.map(toIngestionJobView) };
}

function clampLimit(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}
