// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  readDisplayPreference,
  writeDisplayPreference,
} from "../displayPreference";

/**
 * Issue #650 AC-7: in a server (no `window`) environment the wrapper is a
 * safe no-op — read yields `undefined`, write does nothing and never
 * throws — so SSR never touches localStorage.
 */

describe("displayPreference (SSR / no window)", () => {
  it("readDisplayPreference returns undefined without window", () => {
    expect(typeof window).toBe("undefined");
    expect(readDisplayPreference()).toBeUndefined();
  });

  it("writeDisplayPreference is a no-op without window", () => {
    expect(() => writeDisplayPreference("tile")).not.toThrow();
  });
});
