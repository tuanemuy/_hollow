import type { PromptPurpose } from "./valueObject";

/**
 * SSOT for built-in prompt template defaults exposed to the admin UI as the
 * "system default" value of each `PromptPurpose`.
 *
 * `text` is intentionally the empty string for every purpose. The `promptResolver`
 * contract treats an empty resolved template as "the operator added no extra
 * instruction": the adapter layer (`prompts.ts`) then builds the system prompt
 * from its fixed role declaration + output contract only — this is *not* a
 * provider-specific default (see Issue #218 ADR-002, corrected by #396 ADR-002).
 * Surfacing a concrete default text here would silently inject operator-level
 * intent and change ingestion behaviour. Use UI copy ("システム既定の動作を使用")
 * to communicate this state to the operator instead.
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

/**
 * SSOT for the built-in design-token defaults that the admin UI surfaces as
 * the editable "system default" of each overridable token (Issue #397).
 *
 * This is a *curated subset* of `app/styles/tokens.css` — only the tokens
 * that `spec/design/tokens.md` §12 designates as overridable: brand colors,
 * neutral colors, radius scale, the sans font stack, and code-highlight
 * colors. Tokens whose value is a `var(...)` reference (`--code-comment`,
 * `--color-info`) are deliberately excluded: editing a reference as a literal
 * default is semantically unclear. Breakpoints (`--bp-*`) are excluded because
 * they are media-query literals that a `:root` override cannot affect.
 *
 * Each value is copied verbatim from the `tokens.css` declaration; the
 * `--font-sans` multi-line declaration is normalised to a single line because
 * the `DesignTokens` VO forbids newlines. `defaults.test.ts` machine-verifies
 * that every value here still matches `tokens.css` (whitespace-normalised) so
 * the hand-written constant cannot silently drift from the CSS SSOT.
 */
export const BUILTIN_DESIGN_TOKENS: Readonly<Record<string, string>> =
  Object.freeze({
    // Color: brand
    "--color-accent": "oklch(37.1% 0 0)",
    "--color-accent-hover": "oklch(43.9% 0 0)",
    "--color-accent-pressed": "oklch(26.9% 0 0)",
    "--color-accent-surface": "oklch(97% 0 0)",
    "--color-accent-surface-hover": "oklch(92.2% 0 0)",
    "--color-accent-ink": "oklch(26.9% 0 0)",

    // Color: neutral
    "--color-bg": "#ffffff",
    "--color-surface": "#f5f5f7",
    "--color-surface-hover": "#ececef",
    "--color-surface-elevated": "#fbfbfd",
    "--color-ink": "#1d1d1f",
    "--color-ink-secondary": "#6e6e73",
    "--color-ink-tertiary": "#86868b",
    "--color-hairline": "rgba(60, 60, 67, 0.12)",
    "--color-hairline-strong": "rgba(60, 60, 67, 0.18)",

    // Radius
    "--radius-xs": "4px",
    "--radius-sm": "6px",
    "--radius-md": "8px",
    "--radius-lg": "12px",
    "--radius-xl": "16px",
    "--radius-pill": "980px",
    "--radius-full": "9999px",

    // Typography
    "--font-sans":
      '"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif',

    // Color: code
    "--code-keyword": "#aa3e3e",
    "--code-string": "#2a8c4f",
    "--code-function": "#5b3da1",
    "--code-number": "#1d6fd6",
  });
