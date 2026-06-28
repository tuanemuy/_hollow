import { describe, expect, it } from "vitest";
import { formatMegabytes } from "../byteSize";

const MIB = 1024 * 1024;

// Expected values lock the current `${(bytes / (1024*1024)).toFixed(1)} MB`
// output verbatim (incl. IEEE754 toFixed rounding), not hand-computed math.
// This guards "display does not change" after the de-duplication.
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
