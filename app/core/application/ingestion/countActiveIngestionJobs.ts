import { UserId } from "@/core/domain/identity/valueObject";
import type { IngestionStatus } from "@/core/domain/ingestion/valueObject";
import type { ServiceArgs } from "../types";

/**
 * Statuses the sidebar upload nav item count treats as "active" (work in
 * flight or awaiting the user's preview action). `failed` is intentionally
 * excluded: failed jobs do await an owner decision (retry / discard), but
 * counting them would keep the count permanently lit by unattended failures —
 * the count signals "work in progress", not "inbox". Revisit here if failed
 * jobs should ever be surfaced on the count.
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
