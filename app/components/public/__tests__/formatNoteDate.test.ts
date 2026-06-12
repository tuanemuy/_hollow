import { describe, expect, it } from "vitest";
import { formatPublishedDate, formatRelativeDate } from "../formatNoteDate";

describe("formatPublishedDate", () => {
  it("renders the UTC year/month/day with the 公開 suffix", () => {
    expect(formatPublishedDate(new Date("2026-05-10T00:00:00.000Z"))).toBe(
      "2026年5月10日 公開",
    );
  });
});

describe("formatRelativeDate", () => {
  // Uses local calendar day, so tests depend on runner's TZ. Both dates
  // constructed the same way (local) so they share TZ interpretation.
  // For CI consistency, set TZ=UTC in the test environment.
  const at = (y: number, m: number, d: number, h = 12): Date =>
    new Date(y, m - 1, d, h);

  it("returns 今日 for the same calendar day", () => {
    expect(formatRelativeDate(at(2026, 5, 10, 9), at(2026, 5, 10, 23))).toBe(
      "今日",
    );
  });

  it("returns 昨日 for the previous calendar day", () => {
    expect(formatRelativeDate(at(2026, 5, 9), at(2026, 5, 10))).toBe("昨日");
  });

  it("returns M月D日 for an earlier day in the same year", () => {
    expect(formatRelativeDate(at(2026, 5, 8), at(2026, 5, 10))).toBe("5月8日");
  });

  it("returns YYYY年M月D日 across a year boundary", () => {
    expect(formatRelativeDate(at(2025, 12, 31), at(2026, 1, 2))).toBe(
      "2025年12月31日",
    );
  });

  it("returns an empty string for an unparsable date", () => {
    expect(formatRelativeDate(new Date("not-a-date"), at(2026, 5, 10))).toBe(
      "",
    );
  });
});
