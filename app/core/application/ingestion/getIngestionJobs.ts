import { UserId } from "@/core/domain/identity/valueObject";
import { IngestionStatus } from "@/core/domain/ingestion/valueObject";

import type { ServiceArgs } from "../types";
import { type IngestionJobView, toIngestionJobView } from "./view";

/**
 * Statuses hidden from the upload-queue view by default. Centralised so a
 * future expansion (e.g. also hiding archived entries) is a single-file
 * change. Callers opt out via `includeDiscarded`, or override entirely by
 * passing an explicit `status` filter.
 */
const UPLOAD_QUEUE_DEFAULT_HIDDEN_STATUSES: readonly IngestionStatus[] = [
  "discarded",
];

export type GetIngestionJobsInput = Readonly<{
  actorUserId: string;
  limit?: number;
  offset?: number;
  status?: string;
  order?: "asc" | "desc";
  /**
   * Opt-in flag to surface `discarded` jobs in the result. Defaults to
   * `false` so the upload-queue view hides discarded jobs by default.
   * Ignored when `status` is explicitly set — the explicit status takes
   * precedence (see `IngestionJobListOpts` contract).
   */
  includeDiscarded?: boolean;
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

  // Default behaviour hides `discarded` jobs from the upload queue. The
  // port already guarantees `status` wins over `excludeStatuses`, but we
  // also skip attaching it here so the call site documents the contract
  // explicitly and avoids relying on adapter-side precedence alone.
  const excludeStatuses =
    status === undefined && input.includeDiscarded !== true
      ? UPLOAD_QUEUE_DEFAULT_HIDDEN_STATUSES
      : undefined;

  const jobs = await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository }) => {
      return ingestionJobRepository.findByOwner(actor, {
        limit,
        offset,
        ...(status === undefined ? {} : { status }),
        ...(excludeStatuses === undefined ? {} : { excludeStatuses }),
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
