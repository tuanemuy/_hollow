import { describe, expect, it } from "vitest";
import type { ActivityKind } from "@/core/application/activityLog/types";
import type { HourlyMetricPointDTO } from "@/core/application/adminSettings/getUsageMetrics";
import {
  activityTagTone,
  buildSparkline,
  CHART_HEIGHT,
  CHART_PAD_Y,
  CHART_WIDTH,
  hasActivityRows,
  sumCounts,
} from "../chart";

function series(counts: readonly number[]): readonly HourlyMetricPointDTO[] {
  // hourStart is irrelevant to the geometry; only `count` drives the path.
  return counts.map((count, i) => ({
    hourStart: new Date(i * 3600_000).toISOString(),
    count,
  }));
}

/** Pull the y-coordinates out of an "Mx,y Lx,y ..." line path. */
function lineYs(line: string): number[] {
  return line
    .split(" ")
    .map((cmd) => Number(cmd.replace(/^[ML]/, "").split(",")[1]));
}

const BASELINE_Y = CHART_HEIGHT - CHART_PAD_Y;
const PEAK_Y = CHART_HEIGHT - CHART_PAD_Y - (CHART_HEIGHT - CHART_PAD_Y * 2);

describe("buildSparkline — null vs 0 distinction (AC-3 / 虚偽表示禁止)", () => {
  it("draws a FLAT baseline line for an all-zero (real data) series", () => {
    // 0 件 is real data, not a fetch failure: every point must sit on the
    // baseline so the chart reads as a genuine flat line, distinct from the
    // separate "取得失敗" placeholder the component renders for a null series.
    const { line } = buildSparkline(series([0, 0, 0, 0]));
    const ys = lineYs(line);
    expect(ys).toHaveLength(4);
    for (const y of ys) {
      expect(y).toBe(BASELINE_Y);
    }
    // The flat-zero line is genuinely drawn (non-empty), unlike the null case
    // which never reaches buildSparkline at all.
    expect(line).not.toBe("");
  });

  it("draws a NON-flat curve once any bucket is non-zero, scaling the peak to the top band", () => {
    const { line } = buildSparkline(series([0, 5, 0, 10]));
    const ys = lineYs(line);
    // Distinct y-values prove it is not a flat line.
    expect(new Set(ys).size).toBeGreaterThan(1);
    // The max bucket reaches the top of the usable band; zeros stay on baseline.
    expect(Math.min(...ys)).toBeCloseTo(PEAK_Y, 5);
    expect(Math.max(...ys)).toBe(BASELINE_Y);
  });

  it("spaces points evenly across the full chart width", () => {
    const { line } = buildSparkline(series([1, 2, 3]));
    const xs = line
      .split(" ")
      .map((cmd) => Number(cmd.replace(/^[ML]/, "").split(",")[0]));
    expect(xs).toEqual([0, CHART_WIDTH / 2, CHART_WIDTH]);
  });

  it("returns empty paths for an empty series (caller renders nothing/placeholder)", () => {
    expect(buildSparkline([])).toEqual({ line: "", area: "" });
  });

  it("closes the area path back to the baseline corners", () => {
    const { area } = buildSparkline(series([0, 0]));
    expect(
      area.endsWith(`L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`),
    ).toBe(true);
  });
});

describe("sumCounts", () => {
  it("totals the bucket counts (0 件 sums to 0, not null)", () => {
    expect(sumCounts(series([0, 0, 0]))).toBe(0);
    expect(sumCounts(series([1, 2, 3]))).toBe(6);
  });
});

describe("activityTagTone — matches the P40 mock .tag variants (N-002)", () => {
  const cases: ReadonlyArray<[ActivityKind, string]> = [
    ["user_created", "info"],
    ["large_upload", "warning"],
    ["job_failed", "error"],
    ["settings_changed", "neutral"],
    ["export_completed", "success"],
  ];

  it.each(cases)("maps %s to the mock tone %s", (kind, tone) => {
    expect(activityTagTone(kind)).toBe(tone);
  });

  it("covers every ActivityKind (exhaustive, no fallthrough)", () => {
    const kinds: readonly ActivityKind[] = cases.map(([kind]) => kind);
    expect(new Set(kinds).size).toBe(cases.length);
  });
});

describe("hasActivityRows — empty state / link coexistence (AC-8)", () => {
  it("is false for an empty list → empty message shows, table (and its link) absent", () => {
    expect(hasActivityRows(0)).toBe(false);
  });

  it("is true once there is at least one row → table shows, empty message absent", () => {
    expect(hasActivityRows(1)).toBe(true);
    expect(hasActivityRows(20)).toBe(true);
  });
});
