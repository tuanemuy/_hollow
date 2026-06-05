import type { UserId as UserIdBrand } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";
import { type ExportJobDTO, toExportJobView } from "./view";

export type ListExportJobsInput = Readonly<{
  actorUserId: string;
  limit?: number;
  offset?: number;
}>;

export type ListExportJobsOutput = Readonly<{
  jobs: readonly ExportJobDTO[];
}>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Owner-scoped listing. The repository returns most-recent-first; the
 * usecase clamps the page size so a misbehaving caller cannot ask for
 * an unbounded slice.
 */
export async function listExportJobs({
  container,
  input,
}: ServiceArgs<ListExportJobsInput>): Promise<ListExportJobsOutput> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, input.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, input.offset ?? 0);

  const jobs = await container.unitOfWorkProvider.run(
    async ({ exportJobRepository }) =>
      exportJobRepository.findByOwner(input.actorUserId as UserIdBrand, {
        limit,
        offset,
        order: "desc",
      }),
  );

  return { jobs: jobs.map(toExportJobView) };
}
