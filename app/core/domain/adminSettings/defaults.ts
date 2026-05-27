import type { PromptPurpose } from "./valueObject";

/**
 * SSOT for built-in prompt template defaults exposed to the admin UI as the
 * "system default" value of each `PromptPurpose`.
 *
 * `text` is intentionally the empty string for every purpose. The `promptResolver`
 * contract treats an empty resolved template as the signal to fall back to the LLM
 * provider's own default instruction (see Issue #218 ADR-002). Surfacing a
 * concrete default text here would silently extend that fallback chain and
 * change ingestion behaviour. Use UI copy ("LLM プロバイダの既定指示を使用") to
 * communicate the default to the operator instead.
 *
 * `expectedVariables` is the empty array — keeping it minimal preserves the
 * `PromptTemplate.create` placeholder↔expected mismatch check unchanged for
 * existing admin UI defaults (Issue #218 ADR S-002).
 */
export const BUILTIN_PROMPT_DEFAULTS: Readonly<
  Record<PromptPurpose, { text: string; expectedVariables: readonly string[] }>
> = Object.freeze({
  structure: { text: "", expectedVariables: [] },
  title: { text: "", expectedVariables: [] },
  directory: { text: "", expectedVariables: [] },
  metadata: { text: "", expectedVariables: [] },
  ocr_assist: { text: "", expectedVariables: [] },
});
