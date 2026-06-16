import type { ActivityKind } from "@/core/application/activityLog/types";
import type { HourlyMetricPointDTO } from "@/core/application/adminSettings/getUsageMetrics";

// SVG sparkline geometry mirrors the P40 mock (viewBox 600×140).
export const CHART_WIDTH = 600;
export const CHART_HEIGHT = 140;
// Top/bottom padding so the peak and trough are not clipped at the edges.
export const CHART_PAD_Y = 12;

export type Sparkline = Readonly<{ line: string; area: string }>;

/**
 * Build the SVG `path` data for a 24-point hourly series.
 *
 * Points are evenly spaced across the width. The y-axis is scaled to the
 * series max so the curve fills the band; an all-zero series (real data,
 * not a failure) draws a flat line along the baseline — distinct from the
 * "取得失敗" placeholder the caller renders when the series is `null`. The
 * 0-vs-null distinction (虚偽表示禁止) is therefore split across two layers:
 * `buildSparkline` only ever sees real data and draws an honest flat line for
 * all-zero; the `null` failure case never reaches here.
 */
export function buildSparkline(
  points: readonly HourlyMetricPointDTO[],
): Sparkline {
  if (points.length === 0) return { line: "", area: "" };
  const max = Math.max(...points.map((p) => p.count));
  const usableHeight = CHART_HEIGHT - CHART_PAD_Y * 2;
  const step = points.length > 1 ? CHART_WIDTH / (points.length - 1) : 0;
  const coords = points.map((point, index) => {
    const x = index * step;
    // max === 0 → every point sits on the baseline (flat line).
    const ratio = max === 0 ? 0 : point.count / max;
    const y = CHART_HEIGHT - CHART_PAD_Y - ratio * usableHeight;
    return { x, y };
  });
  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const area = `${line} L${last?.x ?? CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`;
  return { line, area };
}

export function sumCounts(points: readonly HourlyMetricPointDTO[]): number {
  return points.reduce((acc, point) => acc + point.count, 0);
}

/**
 * Whether the "最近のアクティビティ" section should render its table.
 *
 * The empty state ("アクティビティはまだありません") and the (未実装ゆえ
 * 非描画の)「すべて見る」導線 are mutually exclusive by construction: when
 * there are no rows the empty message shows and the table — the only place a
 * row-scoped link could live — is not rendered, so the two never co-appear
 * (二重表示回避). This predicate pins that single branch condition so a
 * regression that renders both at once is caught.
 */
export function hasActivityRows(rowCount: number): boolean {
  return rowCount > 0;
}

/**
 * Visual tag tone for an activity kind, keyed by {@link ActivityKind} to match
 * the P40 mock's `.tag` variants directly (新規ユーザー=info, 大量アップロード=
 * warning, ジョブ失敗=error, 設定変更=无印/neutral, エクスポート完了=success).
 *
 * The tone is a display concern derived from the kind here rather than from the
 * row's backend `severity` (a projection-time field), so the table colours can
 * follow the mock without altering the application-layer severity contract.
 */
export type ActivityTagTone =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "neutral";

export function activityTagTone(kind: ActivityKind): ActivityTagTone {
  switch (kind) {
    case "user_created":
      return "info";
    case "large_upload":
      return "warning";
    case "job_failed":
      return "error";
    case "settings_changed":
      return "neutral";
    case "export_completed":
      return "success";
  }
}
