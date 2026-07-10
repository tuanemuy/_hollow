import { BUILTIN_DESIGN_TOKENS } from "@/core/domain/adminSettings/defaults";
import type { InstanceSettings } from "@/core/domain/adminSettings/entity";

/**
 * Resolves the effective design-token set injected into export artifacts'
 * `:root`.
 *
 * Persisted `settings.designTokens.tokens` holds only genuine overrides —
 * values equal to the built-in default are dropped before persistence
 * (Issue #397 ADR-003). An export artifact is a self-contained document with
 * no live CSS pipeline, so it needs the *complete* effective set: the
 * built-in defaults layered under the operator's overrides (overrides win).
 * The merge order mirrors the admin read model in `dto/adminSettings.ts`.
 *
 * The knowledge of built-in defaults is intentionally localised to the
 * application layer (as in `dto/adminSettings.ts` and `updateDesignTokens`);
 * the `DesignTokens` VO stays unaware of defaults.
 */
export function resolveExportDesignTokens(
  settings: InstanceSettings,
): Readonly<Record<string, string>> {
  return { ...BUILTIN_DESIGN_TOKENS, ...settings.designTokens.tokens };
}
