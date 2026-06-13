// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readDisplayPreference,
  writeDisplayPreference,
} from "../displayPreference";

/**
 * Issue #650 AC-1 / AC-7: the localStorage wrapper round-trips every
 * valid `DisplayMode`, rejects unrecognised stored values, and survives
 * a throwing / absent storage by degrading to `undefined`.
 */

const KEY = "hollow3:noteList:display";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("displayPreference", () => {
  it("round-trips list / tile / calendar (AC-1)", () => {
    for (const mode of ["list", "tile", "calendar"] as const) {
      writeDisplayPreference(mode);
      expect(window.localStorage.getItem(KEY)).toBe(mode);
      expect(readDisplayPreference()).toBe(mode);
    }
  });

  it("returns undefined when nothing is stored", () => {
    expect(readDisplayPreference()).toBeUndefined();
  });

  it("treats an unrecognised stored value as undefined (AC-7)", () => {
    window.localStorage.setItem(KEY, "bogus");
    expect(readDisplayPreference()).toBeUndefined();
  });

  it("does not crash and returns undefined when getItem throws (AC-7)", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(readDisplayPreference()).toBeUndefined();
  });

  it("does not crash when setItem throws (AC-7)", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => writeDisplayPreference("tile")).not.toThrow();
  });
});
