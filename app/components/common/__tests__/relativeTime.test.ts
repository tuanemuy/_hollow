import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../relativeTime";

const NOW = new Date("2026-05-15T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("returns たった今 within the just-now window (and at the throttle width)", () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe("たった今");
    expect(formatRelativeTime(ago(4 * MIN), NOW)).toBe("たった今");
    // 5 min throttle width still reads as たった今 (boundary just under).
    expect(formatRelativeTime(ago(5 * MIN - 1), NOW)).toBe("たった今");
  });

  it("returns 分前 between the just-now window and one hour", () => {
    expect(formatRelativeTime(ago(5 * MIN), NOW)).toBe("5 分前");
    expect(formatRelativeTime(ago(59 * MIN), NOW)).toBe("59 分前");
  });

  it("returns 時間前 between one hour and one day", () => {
    expect(formatRelativeTime(ago(2 * HOUR), NOW)).toBe("2 時間前");
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe("23 時間前");
  });

  it("returns 日前 between one day and the absolute threshold", () => {
    expect(formatRelativeTime(ago(3 * DAY), NOW)).toBe("3 日前");
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe("6 日前");
  });

  it("falls back to an absolute ja-JP date at/over the threshold", () => {
    const result = formatRelativeTime("2026-05-08T00:00:00.000Z", NOW);
    expect(result).toBe("2026年5月8日");
  });

  it("collapses future instants (clock skew) to たった今", () => {
    expect(
      formatRelativeTime(new Date(NOW.getTime() + HOUR).toISOString(), NOW),
    ).toBe("たった今");
  });
});
