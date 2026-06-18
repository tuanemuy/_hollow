import type { AlertDTO } from "../dto/common";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type GetUsageMetricsInput = {
  actorUserId: string;
};

export type HourlyMetricPointDTO = Readonly<{
  /** UTC start of the hour bucket, serialized as an ISO8601 string. */
  hourStart: string;
  count: number;
}>;

export type GetUsageMetricsOutput = Readonly<{
  userCount: number | null;
  storageDurableObjectBytes: number | null;
  storageR2Bytes: number | null;
  uploadsToday: number | null;
  llmCallsToday: number | null;
  /**
   * Hourly upload counts over the last 24h (oldest first), or `null` on
   * fetch failure. A present series is always 24 zero-filled buckets, so
   * a real "0 this hour" is distinct from `null` ("取得失敗").
   */
  uploadsHourly: readonly HourlyMetricPointDTO[] | null;
  /**
   * Hourly LLM-call counts over the last 24h (oldest first), sourced from
   * the `llm_call_log` read-model, or `null` on fetch failure (#748). Same
   * contract as {@link uploadsHourly}: a present series is always 24
   * zero-filled buckets, so a real "0 this hour" is distinct from `null`
   * ("取得失敗"). The figure is best-effort and may under-count.
   */
  llmCallsHourly: readonly HourlyMetricPointDTO[] | null;
  alerts: readonly AlertDTO[];
}>;

/**
 * Best-effort metrics page for the admin console.
 *
 * Each metric is independently nullable so a partial outage in one
 * upstream source does not blank the entire page. The provider's
 * contract is "never throw" — failed metrics surface as `null` and the
 * UI renders a "取得失敗" placeholder for the affected field.
 */
export async function getUsageMetrics({
  container,
  input,
}: ServiceArgs<GetUsageMetricsInput>): Promise<GetUsageMetricsOutput> {
  await container.unitOfWorkProvider.run(async ({ userRepository }) => {
    await assertAdmin(userRepository, input.actorUserId);
  });
  const snapshot = await container.usageMetricsProvider.collect();
  return {
    userCount: snapshot.userCount,
    storageDurableObjectBytes: snapshot.storageDurableObjectBytes,
    storageR2Bytes: snapshot.storageR2Bytes,
    uploadsToday: snapshot.uploadsToday,
    llmCallsToday: snapshot.llmCallsToday,
    uploadsHourly:
      snapshot.uploadsHourly === null
        ? null
        : snapshot.uploadsHourly.map((point) => ({
            hourStart: point.hourStart.toISOString(),
            count: point.count,
          })),
    llmCallsHourly:
      snapshot.llmCallsHourly === null
        ? null
        : snapshot.llmCallsHourly.map((point) => ({
            hourStart: point.hourStart.toISOString(),
            count: point.count,
          })),
    alerts: snapshot.alerts.map((alert) => ({
      code: alert.code,
      message: alert.message,
      severity: alert.severity,
    })),
  };
}
