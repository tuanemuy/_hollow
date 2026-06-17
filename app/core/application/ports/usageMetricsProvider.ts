/**
 * Best-effort runtime metrics surfaced by the admin console
 * (`GetUsageMetrics`).
 *
 * The provider gathers values that span multiple subsystems (D1 row
 * counts, R2 / Durable Object byte totals, daily ingestion / LLM call
 * tallies) and that the request path cannot reasonably compute on its
 * own. Each field is independently nullable so a partial outage in one
 * upstream metric source does not blank the entire page — failed
 * metrics surface as `null` and the UI renders a "取得失敗" placeholder.
 *
 * Implementations must not throw: every per-metric failure is converted
 * into `null` and recorded in `alerts`. Throwing would defeat the
 * partial-failure contract that the admin page depends on.
 */
export interface UsageMetricsProvider {
  collect(): Promise<UsageMetricsSnapshot>;
}

export type UsageMetricsSnapshot = Readonly<{
  userCount: number | null;
  storageDurableObjectBytes: number | null;
  storageR2Bytes: number | null;
  uploadsToday: number | null;
  llmCallsToday: number | null;
  /**
   * Hourly upload counts over the most recent 24 hours, oldest bucket
   * first. Each bucket is keyed by its UTC hour start. The series is
   * always 24 entries when present — providers zero-fill hours with no
   * ingestion so a genuine "0 uploads this hour" renders as a flat line,
   * distinct from a fetch failure.
   *
   * `null` follows the same partial-failure contract as the scalar
   * fields: the metric source failed and the UI renders a "取得失敗"
   * placeholder. An empty/zeroed series is NOT `null` — it is real data.
   */
  uploadsHourly: ReadonlyArray<UsageMetricsHourlyPoint> | null;
  alerts: ReadonlyArray<UsageMetricsAlert>;
}>;

/**
 * One hourly bucket in a 24h time series. `hourStart` is the UTC start
 * of the bucket; `count` is the number of events recorded in that hour.
 */
export type UsageMetricsHourlyPoint = Readonly<{
  hourStart: Date;
  count: number;
}>;

export type UsageMetricsAlert = Readonly<{
  code: string;
  message: string;
  severity: "info" | "warning" | "critical";
}>;

/**
 * No-op provider that returns `null` for every metric. Wired by default
 * when a runtime-specific implementation is not yet available (e.g. the
 * Cloudflare entry point ships without the DO / R2 size aggregator). The
 * admin page renders the "取得失敗" placeholder uniformly, so the page
 * stays usable while operators add per-metric collectors.
 */
export const NullUsageMetricsProvider: UsageMetricsProvider = {
  async collect(): Promise<UsageMetricsSnapshot> {
    return {
      userCount: null,
      storageDurableObjectBytes: null,
      storageR2Bytes: null,
      uploadsToday: null,
      llmCallsToday: null,
      uploadsHourly: null,
      alerts: [],
    };
  },
};
