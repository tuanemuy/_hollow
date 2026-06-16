import { assertAdmin } from "../adminSettings/authorization";
import type { ServiceArgs } from "../types";
import type { ActivityKind, ActivitySeverity } from "./types";

export type GetRecentActivityInput = {
  actorUserId: string;
  /** Number of rows to return (recent-first). Defaults to {@link DEFAULT_RECENT_ACTIVITY_LIMIT}. */
  limit?: number;
};

export const DEFAULT_RECENT_ACTIVITY_LIMIT = 20;

/**
 * One activity-table row projected for the admin dashboard. `occurredAt` is
 * serialized as an ISO8601 string for the transport boundary; the UI formats
 * the time-of-day. `target` / `detail` are pre-rendered human strings.
 */
export type RecentActivityRowDTO = Readonly<{
  /** Stable identity for the React list key. */
  key: string;
  kind: ActivityKind;
  occurredAt: string;
  target: string;
  detail: string;
  /**
   * Projection-recorded severity, kept as a record/audit field on the DTO
   * contract. **Not consumed for display** — the UI derives tag tone from
   * `kind`, so this stays as the value projection records, not a rendering
   * input.
   */
  severity: ActivitySeverity;
}>;

export type GetRecentActivityOutput = Readonly<{
  rows: readonly RecentActivityRowDTO[];
}>;

/**
 * Read the most recent activity-log rows for the admin dashboard.
 *
 * Read-only projection: directly-projected rows plus "大量アップロード" rows
 * derived at read time from the burst intermediate table (ADR-005). Returns
 * an empty `rows` array when the (freshly-deployed) table is empty — the UI
 * renders an honest empty state rather than a falsified row.
 */
export async function getRecentActivity({
  container,
  input,
}: ServiceArgs<GetRecentActivityInput>): Promise<GetRecentActivityOutput> {
  await container.unitOfWorkProvider.run(async ({ userRepository }) => {
    await assertAdmin(userRepository, input.actorUserId);
  });

  const limit = input.limit ?? DEFAULT_RECENT_ACTIVITY_LIMIT;
  const rows = await container.activityLogRepository.findRecent(limit);

  return {
    rows: rows.map((row) => ({
      key: row.key,
      kind: row.kind,
      occurredAt: row.occurredAt.toISOString(),
      target: row.target,
      detail: row.detail,
      severity: row.severity,
    })),
  };
}
