import { gte, sql } from "drizzle-orm";
import type { Clock } from "@/core/application/ports/clock";
import type { Logger } from "@/core/application/ports/logger";
import type {
  UsageMetricsHourlyPoint,
  UsageMetricsProvider,
  UsageMetricsSnapshot,
} from "@/core/application/ports/usageMetricsProvider";
import type { Database } from "../client";
import { ingestionJobs, llmCallLog } from "../schema";

const HOURS_IN_WINDOW = 24;
const HOUR_MS = 3_600_000;

/**
 * D1-backed {@link UsageMetricsProvider}.
 *
 * Two hourly series are sourced from D1 — uploads (from
 * `ingestion_jobs.created_at`) and LLM calls (from `llm_call_log.occurred_at`,
 * #748). Both columns are UTC ISO8601 text, so both series share the same
 * `substr(...,1,13)` hour bucketing. The `llmCallsToday` scalar is also
 * sourced from `llm_call_log` (`COUNT(*)` over the same hour-aligned 24h
 * window as the series, so `scalar === sum(series)`, #748 ADR-004). The remaining
 * scalar fields (`userCount` / `storage*` / `uploadsToday`) stay `null` so
 * those metric cards keep their "取得失敗" behaviour — populating them from D1
 * is a separate Issue.
 *
 * The range predicates (`created_at >= windowStart`, `occurred_at >=
 * windowStart`) are served by `idx_ij_created_at` / `idx_llm_call_log_occurred_at`,
 * bounding each scan to the 24h window rather than the (ever-growing) table.
 *
 * Partial-failure contract: the provider never throws. A failure while
 * computing a series / scalar degrades just that value to `null` (logged),
 * matching the scalar fields' contract. A successful query with no rows in a
 * given hour yields a zero-filled bucket — `0` is real data, not a failure.
 */
export class D1UsageMetricsProvider implements UsageMetricsProvider {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly logger?: Logger,
  ) {}

  async collect(): Promise<UsageMetricsSnapshot> {
    const uploadsHourly = await this.collectUploadsHourly();
    const llmCallsHourly = await this.collectLlmCallsHourly();
    const llmCallsToday = await this.collectLlmCallsToday();
    return {
      userCount: null,
      storageDurableObjectBytes: null,
      storageR2Bytes: null,
      uploadsToday: null,
      llmCallsToday,
      uploadsHourly,
      llmCallsHourly,
      alerts: [],
    };
  }

  private async collectUploadsHourly(): Promise<ReadonlyArray<UsageMetricsHourlyPoint> | null> {
    try {
      const rows = await this.db
        .select({
          bucket: sql<string>`substr(${ingestionJobs.createdAt}, 1, 13)`,
          count: sql<number>`count(*)`,
        })
        .from(ingestionJobs)
        .where(gte(ingestionJobs.createdAt, this.windowStartIso()))
        .groupBy(sql`substr(${ingestionJobs.createdAt}, 1, 13)`);
      return this.fillBuckets(rows);
    } catch (error) {
      // Partial-failure contract: never throw. Degrade this series to
      // `null` so the UI renders a "取得失敗" placeholder.
      this.logger?.warn("Failed to collect hourly upload metrics", { error });
      return null;
    }
  }

  private async collectLlmCallsHourly(): Promise<ReadonlyArray<UsageMetricsHourlyPoint> | null> {
    try {
      // `llm_call_log.occurred_at` is UTC ISO8601 text, so the same
      // lexical `substr(...,1,13)` bucketing as the upload series applies —
      // the two series share bucket boundaries (#748 ADR-007).
      const rows = await this.db
        .select({
          bucket: sql<string>`substr(${llmCallLog.occurredAt}, 1, 13)`,
          count: sql<number>`count(*)`,
        })
        .from(llmCallLog)
        .where(gte(llmCallLog.occurredAt, this.windowStartIso()))
        .groupBy(sql`substr(${llmCallLog.occurredAt}, 1, 13)`);
      return this.fillBuckets(rows);
    } catch (error) {
      this.logger?.warn("Failed to collect hourly LLM call metrics", { error });
      return null;
    }
  }

  /** ISO8601 lower bound = start of the oldest of the 24 hour buckets. */
  private windowStartIso(): string {
    const currentHourStart = floorToHourUtc(this.clock.now());
    return new Date(
      currentHourStart.getTime() - (HOURS_IN_WINDOW - 1) * HOUR_MS,
    ).toISOString();
  }

  /**
   * Zero-fill the 24 consecutive UTC hour buckets ending at the current
   * hour from a sparse `{ bucket, count }` result. The window covers the
   * current (partial) hour plus the previous 23 full hours so the chart's
   * right edge is "now". A `0` is real data (flat line), distinct from a
   * `null` series ("取得失敗").
   */
  private fillBuckets(
    rows: ReadonlyArray<{ bucket: string; count: number }>,
  ): ReadonlyArray<UsageMetricsHourlyPoint> {
    const currentHourStart = floorToHourUtc(this.clock.now());
    const buckets: Date[] = [];
    for (let i = HOURS_IN_WINDOW - 1; i >= 0; i -= 1) {
      buckets.push(new Date(currentHourStart.getTime() - i * HOUR_MS));
    }
    const countByBucket = new Map<string, number>();
    for (const row of rows) {
      countByBucket.set(row.bucket, Number(row.count));
    }
    return buckets.map((hourStart) => ({
      hourStart,
      count: countByBucket.get(hourBucketKey(hourStart)) ?? 0,
    }));
  }

  /**
   * `llm_call_log` count over the 24h display window (#748 ADR-004). The
   * lower bound is `windowStartIso()` — the same hour-aligned ISO8601 bound
   * the hourly series uses (current partial hour + previous 23 full hours),
   * not an exact `now - 24h` sliding window. Sharing the bound guarantees
   * `scalar === sum(hourly series)`, which the dashboard relies on (#748
   * ADR-004 Consequences). Best-effort: a query failure degrades to `null`
   * ("取得失敗"), never throws.
   */
  private async collectLlmCallsToday(): Promise<number | null> {
    try {
      const rows = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(llmCallLog)
        .where(gte(llmCallLog.occurredAt, this.windowStartIso()));
      return Number(rows[0]?.count ?? 0);
    } catch (error) {
      this.logger?.warn("Failed to collect 24h LLM call count", { error });
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
