import { describe, expect, it } from "vitest";
import { backoffWaitMs, isAutosaveExhausted } from "../useAutosave";

describe("backoffWaitMs", () => {
  it("returns BACKOFF_BASE_MS for the first attempt", () => {
    expect(backoffWaitMs(1)).toBe(500);
  });

  it("doubles for the second attempt", () => {
    expect(backoffWaitMs(2)).toBe(1000);
  });

  it("doubles again for the third attempt", () => {
    expect(backoffWaitMs(3)).toBe(2000);
  });

  it("collapses to 0 for attempt 0", () => {
    expect(backoffWaitMs(0)).toBe(0);
  });

  it("collapses to 0 for negative attempts", () => {
    expect(backoffWaitMs(-1)).toBe(0);
    expect(backoffWaitMs(-100)).toBe(0);
  });
});

describe("isAutosaveExhausted", () => {
  it("is false before any retry", () => {
    expect(isAutosaveExhausted(0)).toBe(false);
  });

  it("is false at attempt 1", () => {
    expect(isAutosaveExhausted(1)).toBe(false);
  });

  it("is false at attempt 2 (still inside the ladder)", () => {
    expect(isAutosaveExhausted(2)).toBe(false);
  });

  it("flips to true at MAX_ATTEMPTS (3)", () => {
    expect(isAutosaveExhausted(3)).toBe(true);
  });

  it("stays true beyond MAX_ATTEMPTS", () => {
    expect(isAutosaveExhausted(4)).toBe(true);
    expect(isAutosaveExhausted(99)).toBe(true);
  });
});
