import { describe, expect, it } from "vitest";
import { formatJstDateTime } from "../dateFormat";

// A boundary instant: 2026-01-01T16:00:00Z is already 2026-01-02 01:00 in JST.
// Because the helper pins `timeZone: "Asia/Tokyo"`, every assertion below is
// runner-TZ-independent — TZ=UTC and TZ=Asia/Tokyo produce the same output
// (this satisfies the Issue's "identical under TZ=UTC / Asia/Tokyo" proposal).
// Dropping the timeZone pin would make (a)/(b) yield the UTC-side 1月1日 /
// 16:00 under a UTC runner, so this doubles as a regression guard.
const BOUNDARY = "2026-01-01T16:00:00Z";

describe("formatJstDateTime", () => {
  it("renders date-only options on the JST side of a boundary instant", () => {
    expect(
      formatJstDateTime(BOUNDARY, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    ).toBe("2026年1月2日");
  });

  it("renders date-time options on the JST side of a boundary instant", () => {
    expect(
      formatJstDateTime(BOUNDARY, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ).toBe("2026年1月2日 01:00");
  });

  // Safety net for the spread order `{ ...options, timeZone: "Asia/Tokyo" }`
  // (ADR-002): even if a caller mistakenly passes its own `timeZone`, the
  // trailing JST pin must win. America/New_York would render the UTC-side
  // 2026年1月1日, so seeing the JST-side 2026年1月2日 proves JST overrides it.
  it("overrides a caller-supplied timeZone with JST (spread-order safety net / ADR-002)", () => {
    expect(
      formatJstDateTime(BOUNDARY, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      }),
    ).toBe("2026年1月2日");
  });

  it("returns the raw string for unparsable input", () => {
    expect(formatJstDateTime("not-a-date", { year: "numeric" })).toBe(
      "not-a-date",
    );
  });
});
