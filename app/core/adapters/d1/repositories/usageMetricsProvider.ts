import { gte, sql } from "drizzle-orm";
import type { Clock } from "@/core/application/ports/clock";
import type { Logger } from "@/core/application/ports/logger";
import type {
  UsageMetricsHourlyPoint,
  UsageMetricsProvider,
  UsageMetricsSnapshot,
} from "@/core/application/ports/usageMetricsProvider";
import type { Database } from "../client";
import { ingestionJobs } from "../schema";

const HOURS_IN_WINDOW = 24;
const HOUR_MS = 3_600_000;

/**
 * D1-backed {@link UsageMetricsProvider}.
 *
 * Only the hourly time series is sourced from D1 (Issue #595, PR-A); the
 * scalar fields (`userCount` / `storage*` / `uploadsToday` /
 * `llmCallsToday`) stay `null` so the existing four metric cards keep
 * their #545 behaviour ("取得失敗"). Populating those scalars from D1 is a
 * separate Issue.
 *
 * `uploadsHourly` is derived directly from `ingestion_jobs.created_at`
 * (UTC ISO8601). There is no dedicated upload-counter table — the 24h /
 * hourly cardinality is small and the existing `idx_ij_status_updated`
 * index keeps the scan bounded (ADR-002). LLM calls have no persistent
 * record source (A-1), so no LLM series is produced.
 *
 * Partial-failure contract: the provider never throws. A failure while
 * computing the series degrades that series to `null` (logged), matching
 * the scalar fields' contract. A successful query with no rows in a given
 * hour yields a zero-filled bucket — `0` is real data, not a failure.
 */
export class D1UsageMetricsProvider implements UsageMetricsProvider {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly logger?: Logger,
  ) {}

  async collect(): Promise<UsageMetricsSnapshot> {
    const uploadsHourly = await this.collectUploadsHourly();
    return {
      userCount: null,
      storageDurableObjectBytes: null,
      storageR2Bytes: null,
      uploadsToday: null,
      llmCallsToday: null,
      uploadsHourly,
      alerts: [],
    };
  }

  private async collectUploadsHourly(): Promise<ReadonlyArray<UsageMetricsHourlyPoint> | null> {
    // 24 consecutive UTC hour buckets ending at the current hour. The
    // window covers the current (partial) hour plus the previous 23 full
    // hours so the chart's right edge is "now".
    const now = this.clock.now();
    const currentHourStart = floorToHourUtc(now);
    const buckets: Date[] = [];
    for (let i = HOURS_IN_WINDOW - 1; i >= 0; i -= 1) {
      buckets.push(new Date(currentHourStart.getTime() - i * HOUR_MS));
    }
    const windowStartIso = buckets[0]?.toISOString();
    if (windowStartIso === undefined) return null;

    try {
      // Bucket key = "YYYY-MM-DDTHH" (UTC). `created_at` is a UTC ISO8601
      // string so a lexical substring is a correct hour bucket.
      const bucketKey = sql<string>`substr(${ingestionJobs.createdAt}, 1, 13)`;
      const rows = await this.db
        .select({
          bucket: bucketKey,
          count: sql<number>`count(*)`,
        })
        .from(ingestionJobs)
        .where(gte(ingestionJobs.createdAt, windowStartIso))
        .groupBy(bucketKey);

      const countByBucket = new Map<string, number>();
      for (const row of rows) {
        countByBucket.set(row.bucket, Number(row.count));
      }

      return buckets.map((hourStart) => ({
        hourStart,
        count: countByBucket.get(hourBucketKey(hourStart)) ?? 0,
      }));
    } catch (error) {
      // Partial-failure contract: never throw. Degrade this series to
      // `null` so the UI renders a "取得失敗" placeholder.
      this.logger?.warn("Failed to collect hourly upload metrics", { error });
      return null;
    }
  }
}

/** Floor a `Date` to the start of its UTC hour. */
function floorToHourUtc(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

/** "YYYY-MM-DDTHH" UTC bucket key matching the SQL `substr(...,1,13)`. */
function hourBucketKey(hourStart: Date): string {
  return hourStart.toISOString().slice(0, 13);
}
