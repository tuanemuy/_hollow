import { describe, expect, it } from "vitest";
import { assertNoShippedPlaceholders } from "../placeholderGuard.ts";

// Must equal `SHIPPED_DEV_PLACEHOLDER_VALUES.SECRET_BOX_MASTER_KEY` in
// `../placeholderGuard.ts` and `SHIPPED_DEV_PLACEHOLDER_KEY` in
// `app/core/adapters/security/secretBox.ts` (= base64 of
// "dev-only-do-not-use-in-prod-do-1").
const SHIPPED_DEV_MASTER_KEY = "ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kLWRvLTE=";

describe("assertNoShippedPlaceholders", () => {
  it("flags the shipped dev placeholder value", () => {
    const result = assertNoShippedPlaceholders({
      SECRET_BOX_MASTER_KEY: SHIPPED_DEV_MASTER_KEY,
      BETTER_AUTH_SECRET: "real",
    });
    expect(result).toEqual([
      "shipped dev placeholder detected for SECRET_BOX_MASTER_KEY (replace it with a real secret)",
    ]);
  });

  it("returns empty for a real (non-placeholder) value", () => {
    const result = assertNoShippedPlaceholders({
      SECRET_BOX_MASTER_KEY: "a-real-production-key",
      BETTER_AUTH_SECRET: "real",
    });
    expect(result).toEqual([]);
  });

  it("returns empty when the guarded key is absent", () => {
    const result = assertNoShippedPlaceholders({ BETTER_AUTH_SECRET: "real" });
    expect(result).toEqual([]);
  });
});
