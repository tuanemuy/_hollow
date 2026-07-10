import { describe, expect, it } from "vitest";
import { formatBytes, formatMegabytes } from "../byteSize";

const MIB = 1024 * 1024;

// Expected values lock the current `${(bytes / (1024*1024)).toFixed(1)} MB`
// output verbatim (incl. IEEE754 toFixed rounding), not hand-computed math,
// to guard that the displayed label does not change.
describe("formatMegabytes", () => {
  it("formats zero as a fixed one-decimal MB label", () => {
    expect(formatMegabytes(0)).toBe("0.0 MB");
  });

  it("formats whole and consumer-threshold sizes", () => {
    expect(formatMegabytes(MIB)).toBe("1.0 MB");
    // DEFAULT_MAX_INGESTION_BYTES (UploadForm)
    expect(formatMegabytes(50 * MIB)).toBe("50.0 MB");
    // MAX_RECORDING_BYTES (AudioRecorder)
    expect(formatMegabytes(24 * MIB)).toBe("24.0 MB");
    // BYTE_SIZE_MAX (MediaUploader): 5 GiB still reads as flat MB
    expect(formatMegabytes(5 * 1024 * MIB)).toBe("5120.0 MB");
  });

  it("rounds to one decimal at the boundary", () => {
    expect(formatMegabytes(1.5 * MIB)).toBe("1.5 MB");
    expect(formatMegabytes(1.25 * MIB)).toBe("1.3 MB");
  });
});

// Expected values lock the current variable-unit output verbatim (incl. the
// U+2014 EM DASH for null and the `scaled >= 100 || i === 0 ? 0 : 1` decimal
// rule), not hand-computed math, so the admin storage/limits and
// account-deletion impact labels do not change under the shared helper.
describe("formatBytes", () => {
  it("renders missing totals as an em dash and zero as bytes", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(0)).toBe("0 B");
  });

  it("renders the byte range with no decimal (i === 0)", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("switches unit at each 1024-based boundary with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 ** 2)).toBe("1.0 MB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
    expect(formatBytes(1024 ** 4)).toBe("1.0 TB");
  });

  it("drops the decimal exactly at the scaled-value 100 boundary", () => {
    // brackets the `scaled >= 100` switch: 99 keeps the decimal, 100 drops it
    expect(formatBytes(99 * 1024)).toBe("99.0 KB");
    expect(formatBytes(100 * 1024)).toBe("100 KB");
    expect(formatBytes(100 * 1024 ** 2)).toBe("100 MB");
  });

  it("clamps magnitudes past TB to TB", () => {
    expect(formatBytes(1024 ** 5)).toBe("1024 TB");
  });

  it("applies toFixed rounding within a unit", () => {
    expect(formatBytes(1536)).toBe("1.5 KB"); // exact half, no rounding
    // 1280 / 1024 = 1.25 → toFixed(1) rounds to "1.3" (same IEEE754 rounding
    // the sibling formatMegabytes locks at 1.25 MiB → "1.3 MB")
    expect(formatBytes(1280)).toBe("1.3 KB");
  });

  it("locks representative in-app limit thresholds", () => {
    // instance limits (admin/Metrics): export-artifact cap renders 0-decimal
    // once scaled >= 100, ingestion cap keeps one decimal
    expect(formatBytes(256 * 1024 ** 2)).toBe("256 MB");
    expect(formatBytes(32 * 1024 ** 2)).toBe("32.0 MB");
    // account-deletion impact (identity/AccountDeleteForm): a GB-range total
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.0 GB");
  });
});
