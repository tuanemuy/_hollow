import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertNoShippedPlaceholders,
  SHIPPED_DEV_PLACEHOLDER_VALUES,
} from "../placeholderGuard.ts";

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

  it("flags the placeholder even with surrounding whitespace", () => {
    const result = assertNoShippedPlaceholders({
      SECRET_BOX_MASTER_KEY: `  ${SHIPPED_DEV_MASTER_KEY}\n`,
    });
    expect(result).toHaveLength(1);
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

describe("SHIPPED_DEV_PLACEHOLDER_VALUES", () => {
  // Anchor the infra-side copy to `.dev.vars.example` — the same common
  // source the app-side test (`secretBox.test.ts`) checks — so rotating the
  // placeholder without updating every copy fails CI from either workspace.
  // (infra cannot import app code, hence the file read instead of a shared
  // import.)
  it("matches the SECRET_BOX_MASTER_KEY value in .dev.vars.example", () => {
    const devVarsPath = fileURLToPath(
      new URL("../../../.dev.vars.example", import.meta.url),
    );
    const contents = readFileSync(devVarsPath, "utf8");
    const match = contents.match(/^SECRET_BOX_MASTER_KEY="([^"]*)"/m);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(
      SHIPPED_DEV_PLACEHOLDER_VALUES.SECRET_BOX_MASTER_KEY,
    );
  });
});
