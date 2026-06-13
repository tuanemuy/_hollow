import { UserId } from "@/core/domain/identity/valueObject";
import type { IngestionStatus } from "@/core/domain/ingestion/valueObject";
import type { ServiceArgs } from "../types";

/**
 * Statuses the header queue badge counts as "active" (work in flight or
 * awaiting the user's preview action). `failed` is intentionally excluded:
 * failed jobs do await an owner decision (retry / discard), but counting
 * them would keep the badge permanently lit by unattended failures —
 * the badge signals "work in progress", not "inbox". Revisit here if
 * failed jobs should ever be surfaced on the badge.
 */
const ACTIVE_INGESTION_STATUSES: readonly IngestionStatus[] = [
  "pending",
  "processing",
  "previewing",
];

export type CountActiveIngestionJobsInput = Readonly<{
  actorUserId: string;
}>;

export type CountActiveIngestionJobsOutput = Readonly<{
  count: number;
}>;

export async function countActiveIngestionJobs({
  container,
  input,
}: ServiceArgs<CountActiveIngestionJobsInput>): Promise<CountActiveIngestionJobsOutput> {
  const actor = UserId.create(input.actorUserId);

  const count = await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository }) =>
      ingestionJobRepository.countByOwner(actor, {
        statuses: ACTIVE_INGESTION_STATUSES,
      }),
  );

  return { count };
}
