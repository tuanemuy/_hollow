import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILTIN_DESIGN_TOKENS } from "../defaults";
import { DesignTokens } from "../valueObject";

const TOKENS_CSS_PATH = fileURLToPath(
  new URL("../../../../styles/tokens.css", import.meta.url),
);

/** Collapse any run of whitespace (including newlines) to a single space. */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Parse the `:root { ... }` declarations of `tokens.css` into a
 * `key -> normalised value` map. Declarations are split on `;` and each
 * declaration is split on the *first* `:` only (`indexOf`) so values that
 * contain colons / commas (e.g. `clamp(...)`, `rgba(...)`) survive intact.
 */
function parseTokensCss(css: string): Record<string, string> {
  const rootMatch = css.match(/:root\s*\{([\s\S]*)\}/);
  if (rootMatch === null) {
    throw new Error("could not locate :root block in tokens.css");
  }
  // Strip CSS comments first so a `:` inside `/* Color: brand */` does not
  // get mistaken for a declaration separator.
  const body = rootMatch[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const rawDeclaration of body.split(";")) {
    const declaration = rawDeclaration.trim();
    if (declaration.length === 0) continue;
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const key = declaration.slice(0, colon).trim();
    if (!key.startsWith("--")) continue;
    const value = normalizeWhitespace(declaration.slice(colon + 1));
    out[key] = value;
  }
  return out;
}

describe("BUILTIN_DESIGN_TOKENS", () => {
  const cssTokens = parseTokensCss(readFileSync(TOKENS_CSS_PATH, "utf8"));

  it("every default value matches the tokens.css declaration verbatim", () => {
    // One-way check only (defaults -> tokens.css): tokens.css holds ~90
    // tokens but only a curated subset is overridable, so verifying the
    // reverse direction would over-detect non-overridable tokens.
    for (const [key, value] of Object.entries(BUILTIN_DESIGN_TOKENS)) {
      expect(
        Object.hasOwn(cssTokens, key),
        `tokens.css is missing ${key}`,
      ).toBe(true);
      expect(normalizeWhitespace(value), `value drift for ${key}`).toBe(
        cssTokens[key],
      );
    }
  });

  it("every default key/value satisfies the DesignTokens VO", () => {
    for (const [key, value] of Object.entries(BUILTIN_DESIGN_TOKENS)) {
      expect(() =>
        DesignTokens.create({ tokens: { [key]: value } }),
      ).not.toThrow();
    }
  });
});
