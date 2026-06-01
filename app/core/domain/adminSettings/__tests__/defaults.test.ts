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
 *
 * Only the *first* `:root` block is matched (`[^}]*` stops at the first `}`):
 * `tokens.css`'s `:root` has no nested braces, and a greedy `[\s\S]*` would
 * swallow trailing `}` if a second `:root` (e.g. `[data-theme="dark"]`) or an
 * `@media` block were added later, silently breaking this consistency check.
 */
function parseTokensCss(css: string): Record<string, string> {
  const rootMatch = css.match(/:root\s*\{([^}]*)\}/);
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

describe("parseTokensCss", () => {
  it("parses multi-line declarations and values with commas/colons", () => {
    const css = `
      /* Color: brand */
      :root {
        --font-sans:
          "Helvetica Neue", Arial,
          sans-serif;
        --space: clamp(1rem, 2vw, 2rem);
        --color-hairline: rgba(60, 60, 67, 0.12);
        --not-a-token: ignored;
      }
    `;
    expect(parseTokensCss(css)).toEqual({
      "--font-sans": '"Helvetica Neue", Arial, sans-serif',
      "--space": "clamp(1rem, 2vw, 2rem)",
      "--color-hairline": "rgba(60, 60, 67, 0.12)",
      "--not-a-token": "ignored",
    });
  });

  it("ignores colons inside comments", () => {
    const css = `:root {
      /* Color: brand accent */
      --color-accent: #abc;
    }`;
    expect(parseTokensCss(css)).toEqual({ "--color-accent": "#abc" });
  });

  it("stops at the first :root block", () => {
    const css = `:root {
      --color-accent: #fff;
    }
    [data-theme="dark"] {
      --color-accent: #000;
    }`;
    expect(parseTokensCss(css)).toEqual({ "--color-accent": "#fff" });
  });

  it("throws when no :root block is present", () => {
    expect(() => parseTokensCss(".foo { color: red; }")).toThrow(
      /could not locate :root block/,
    );
  });
});

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
