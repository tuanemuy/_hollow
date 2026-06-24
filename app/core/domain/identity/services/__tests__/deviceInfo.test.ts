import { describe, expect, it } from "vitest";
import { parseDeviceInfo } from "../deviceInfo";

describe("parseDeviceInfo", () => {
  it("parses macOS Safari into a desktop with a composed label", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    expect(parseDeviceInfo(ua)).toEqual({
      kind: "desktop",
      os: "macOS",
      browser: "Safari",
      label: "Safari on macOS",
    });
  });

  it("parses Windows Chrome into a desktop", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    expect(parseDeviceInfo(ua)).toEqual({
      kind: "desktop",
      os: "Windows",
      browser: "Chrome",
      label: "Chrome on Windows",
    });
  });

  it("parses an iPhone into a mobile device", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1";
    const info = parseDeviceInfo(ua);
    expect(info.kind).toBe("mobile");
    expect(info.os).toBe("iOS");
    expect(info.browser).toBe("Safari");
    expect(info.label).toBe("Safari on iOS");
  });

  it("parses an iPad into a tablet (iPad token beats Macintosh)", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1";
    const info = parseDeviceInfo(ua);
    expect(info.kind).toBe("tablet");
    expect(info.os).toBe("iPadOS");
  });

  it("classifies an Android phone as mobile and an Android tablet as tablet", () => {
    const phone =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    const tablet =
      "Mozilla/5.0 (Linux; Android 14; SM-X510) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    expect(parseDeviceInfo(phone).kind).toBe("mobile");
    expect(parseDeviceInfo(phone).os).toBe("Android");
    expect(parseDeviceInfo(tablet).kind).toBe("tablet");
  });

  it("detects Edge ahead of Chrome / Safari tokens", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
    expect(parseDeviceInfo(ua).browser).toBe("Edge");
  });

  it("detects Firefox", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0";
    expect(parseDeviceInfo(ua).browser).toBe("Firefox");
  });

  it("returns null fields (no fabrication) for an unrecognised UA", () => {
    const info = parseDeviceInfo("CustomAgent/9.9");
    expect(info).toEqual({
      kind: "unknown",
      os: null,
      browser: null,
      label: null,
    });
  });

  it("leaves label null when only one of os / browser is known", () => {
    // OS recognisable (Windows) but no known browser token.
    const info = parseDeviceInfo("Mozilla/5.0 (Windows NT 10.0) UnknownEngine");
    expect(info.os).toBe("Windows");
    expect(info.browser).toBeNull();
    expect(info.label).toBeNull();
    expect(info.kind).toBe("desktop");
  });

  it("returns the all-unknown shape for null and empty input", () => {
    const expected = {
      kind: "unknown",
      os: null,
      browser: null,
      label: null,
    } as const;
    expect(parseDeviceInfo(null)).toEqual(expected);
    expect(parseDeviceInfo("   ")).toEqual(expected);
  });
});
