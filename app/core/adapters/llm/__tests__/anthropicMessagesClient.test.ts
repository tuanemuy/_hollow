import { describe, expect, it } from "vitest";
import { arrayBufferToBase64 } from "../anthropicMessagesClient";

function roundTrip(buffer: ArrayBuffer): Uint8Array {
  const base64 = arrayBufferToBase64(buffer);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function makeRandomBuffer(size: number): ArrayBuffer {
  const bytes = new Uint8Array(size);
  // Deterministic pseudo-random: keep the test reproducible without
  // pulling in a seedable RNG.
  for (let i = 0; i < size; i++) {
    bytes[i] = (i * 2654435761) & 0xff;
  }
  return bytes.buffer;
}

describe("arrayBufferToBase64", () => {
  it("returns an empty string for an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  it("round-trips at one byte below the 8KB chunk boundary (8191)", () => {
    const buffer = makeRandomBuffer(8191);
    const decoded = roundTrip(buffer);
    expect(decoded).toEqual(new Uint8Array(buffer));
  });

  it("round-trips exactly at the 8KB chunk boundary (8192)", () => {
    const buffer = makeRandomBuffer(8192);
    const decoded = roundTrip(buffer);
    expect(decoded).toEqual(new Uint8Array(buffer));
  });

  it("round-trips at one byte past the 8KB chunk boundary (8193)", () => {
    const buffer = makeRandomBuffer(8193);
    const decoded = roundTrip(buffer);
    expect(decoded).toEqual(new Uint8Array(buffer));
  });

  it("round-trips a 100KB buffer (many chunks)", () => {
    const buffer = makeRandomBuffer(100 * 1024);
    const decoded = roundTrip(buffer);
    expect(decoded).toEqual(new Uint8Array(buffer));
  });

  it("preserves Latin-1 byte semantics for 0x80..0xFF", () => {
    const bytes = new Uint8Array(128);
    for (let i = 0; i < 128; i++) {
      bytes[i] = 0x80 + i;
    }
    const decoded = roundTrip(bytes.buffer);
    expect(decoded).toEqual(bytes);
  });
});
