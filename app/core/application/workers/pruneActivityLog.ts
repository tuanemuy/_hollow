import {
  ACTIVITY_LOG_RETENTION_DAYS,
  INGESTION_BURST_LOG_RETENTION_HOURS,
} from "../activityLog/types";
import type { WorkerContainer } from "../di/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Prune the activity-log read-model tables (ADR-007).
 *
 * Both tables accumulate one row per event and are NOT swept by the outbox
 * pruner (which only touches `outbox_events`). The burst table is high
 * frequency (1:1 with `ingestion.created`) so it is kept to a short 24h
 * window — long enough for the read-time burst aggregation, which never
 * looks back further. The activity log itself is kept to
 * `ACTIVITY_LOG_RETENTION_DAYS`; the dashboard only ever shows the most
 * recent N rows, so trimming history never breaks the display.
 *
 * Runs on the pruner worker's daily tick alongside {@link pruneOutbox}.
 */
export async function pruneActivityLog(
  container: WorkerContainer,
): Promise<{ activityDeleted: number; burstDeleted: number }> {
  const { clock, logger, activityLogRepository } = container;
  const now = clock.now();

  const activityCutoff = new Date(
    now.getTime() - ACTIVITY_LOG_RETENTION_DAYS * DAY_MS,
  );
  const burstCutoff = new Date(
    now.getTime() - INGESTION_BURST_LOG_RETENTION_HOURS * HOUR_MS,
  );

  const { deleted: activityDeleted } =
    await activityLogRepository.pruneOlderThan(activityCutoff);
  const { deleted: burstDeleted } =
    await activityLogRepository.pruneBurstOlderThan(burstCutoff);

  logger.info(
    `[activity] pruned ${activityDeleted} activity row(s), ${burstDeleted} burst row(s)`,
    {
      activityDeleted,
      burstDeleted,
      activityCutoff: activityCutoff.toISOString(),
      burstCutoff: burstCutoff.toISOString(),
    },
  );
  return { activityDeleted, burstDeleted };
}
