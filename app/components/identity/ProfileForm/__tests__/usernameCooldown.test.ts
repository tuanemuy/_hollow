import { describe, expect, it } from "vitest";
import { USERNAME_CHANGE_COOLDOWN_MS } from "@/core/domain/identity/entity";
import { nextUsernameChangeAt } from "../usernameCooldown";

const CHANGED_AT = "2026-05-01T00:00:00.000Z";
const changedAtMs = new Date(CHANGED_AT).getTime();

describe("nextUsernameChangeAt", () => {
  it("returns null when never changed", () => {
    expect(nextUsernameChangeAt(null, new Date(changedAtMs))).toBeNull();
  });

  it("returns the next allowed date while the cooldown is still active", () => {
    // now is one day after the change → cooldown not yet elapsed.
    const now = new Date(changedAtMs + 24 * 60 * 60 * 1000);
    const next = nextUsernameChangeAt(CHANGED_AT, now);
    expect(next).not.toBeNull();
    expect(next?.getTime()).toBe(changedAtMs + USERNAME_CHANGE_COOLDOWN_MS);
  });

  it("returns null once the cooldown has elapsed", () => {
    const now = new Date(changedAtMs + USERNAME_CHANGE_COOLDOWN_MS + 1);
    expect(nextUsernameChangeAt(CHANGED_AT, now)).toBeNull();
  });

  it("returns null exactly at the cooldown boundary (change already allowed)", () => {
    const now = new Date(changedAtMs + USERNAME_CHANGE_COOLDOWN_MS);
    expect(nextUsernameChangeAt(CHANGED_AT, now)).toBeNull();
  });
});
