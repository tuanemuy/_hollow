import { describe, expect, it } from "vitest";
import { BUILTIN_DESIGN_TOKENS } from "@/core/domain/adminSettings/defaults";
import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { DesignTokens } from "@/core/domain/adminSettings/valueObject";
import { resolveExportDesignTokens } from "../designTokens";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("resolveExportDesignTokens", () => {
  it("returns all built-in defaults when there is no override", () => {
    const settings = InstanceSettings.default(now);
    const resolved = resolveExportDesignTokens(settings);
    for (const [key, value] of Object.entries(BUILTIN_DESIGN_TOKENS)) {
      expect(resolved[key]).toBe(value);
    }
  });

  it("lets overrides win over the built-in default", () => {
    const base = InstanceSettings.default(now);
    const settings = InstanceSettings.updateDesignTokens(
      base,
      DesignTokens.create({ tokens: { "--color-accent": "#ff0000" } }),
      now,
    );
    const resolved = resolveExportDesignTokens(settings);
    expect(resolved["--color-accent"]).toBe("#ff0000");
    expect(resolved["--radius-md"]).toBe(BUILTIN_DESIGN_TOKENS["--radius-md"]);
  });
});
