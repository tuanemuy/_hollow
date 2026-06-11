import { describe, expect, it } from "vitest";
import { normalizePublicDateRange } from "../publicDateRange";

/**
 * #619 ADR-006: the URL `from`/`to` (`YYYY-MM-DD`) normalise to the half-open
 * `DateRange` VO. `to` is an INCLUSIVE end date, so it is pushed to the
 * day-after 00:00 UTC (the adapter applies `lt`) — these cases pin the
 * off-by-one boundaries the plan requires.
 */
describe("normalizePublicDateRange", () => {
  it("returns undefined when neither bound is set", () => {
    expect(normalizePublicDateRange(undefined, undefined)).toBeUndefined();
  });

  it("returns undefined when both bounds normalize to null (invalid strings)", () => {
    // Invalid date strings → null for both bounds → undefined result.
    // This documents the normalization step that the first test implicitly covers.
    const result = normalizePublicDateRange("invalid", "also-invalid");
    expect(result).toBeUndefined();
  });

  it("maps `from` to that day's UTC 00:00", () => {
    const r = normalizePublicDateRange("2026-05-01", undefined);
    expect(r?.from?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r?.to).toBeNull();
  });

  it("maps the inclusive `to` to the NEXT day's UTC 00:00 (exclusive bound)", () => {
    const r = normalizePublicDateRange(undefined, "2026-05-31");
    expect(r?.from).toBeNull();
    // 2026-06-01 00:00 — so a note published on 2026-05-31 is included by `lt`.
    expect(r?.to?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("maps both bounds together", () => {
    const r = normalizePublicDateRange("2026-05-01", "2026-05-31");
    expect(r?.from?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r?.to?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("same-day from=to spans exactly that one day (00:00 → next 00:00)", () => {
    const r = normalizePublicDateRange("2026-05-10", "2026-05-10");
    expect(r?.from?.toISOString()).toBe("2026-05-10T00:00:00.000Z");
    expect(r?.to?.toISOString()).toBe("2026-05-11T00:00:00.000Z");
    // The window is non-empty: a note published at any time on 2026-05-10
    // (`gte from` & `lt to`) falls inside.
    const published = new Date("2026-05-10T15:30:00.000Z").getTime();
    expect(published).toBeGreaterThanOrEqual(r?.from?.getTime() ?? 0);
    expect(published).toBeLessThan(r?.to?.getTime() ?? 0);
  });
});
