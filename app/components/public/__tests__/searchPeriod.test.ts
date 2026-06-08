import { describe, expect, it } from "vitest";
import {
  isSearchPeriod,
  PERIOD_LABELS,
  periodToDateRange,
} from "../searchPeriod";

describe("searchPeriod helpers (#568)", () => {
  it("isSearchPeriod accepts the known tokens and rejects others", () => {
    expect(isSearchPeriod("7d")).toBe(true);
    expect(isSearchPeriod("all")).toBe(true);
    expect(isSearchPeriod("90d")).toBe(false);
    expect(isSearchPeriod(undefined)).toBe(false);
  });

  it("periodToDateRange returns null for all / absent and a window otherwise", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(periodToDateRange("all", now)).toBeNull();
    expect(periodToDateRange(null, now)).toBeNull();

    const r7 = periodToDateRange("7d", now);
    expect(r7?.to).toEqual(now);
    expect(r7?.from).toEqual(new Date("2026-05-25T00:00:00.000Z"));

    const r1y = periodToDateRange("1y", now);
    expect(r1y?.from.getTime()).toBe(now.getTime() - 365 * 86_400_000);
  });

  it("labels every period in Japanese", () => {
    expect(PERIOD_LABELS["30d"]).toBe("過去 30 日");
    expect(PERIOD_LABELS.all).toBe("すべて");
  });
});
