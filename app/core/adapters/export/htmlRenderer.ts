import type { HtmlRenderer } from "@/core/domain/export/ports/htmlRenderer";
import type {
  FrontMatter,
  FrontMatterValue,
} from "@/core/domain/note/valueObject";

/**
 * Minimal HTML renderer adapter.
 *
 * Wraps the canonical content HTML in a standalone document so the
 * artifact renders without the live site's CSS pipeline. The supplied
 * design tokens are projected as CSS custom properties on `:root`;
 * FrontMatter — when requested — is prepended as a YAML-style comment
 * block so the metadata travels with the file but does not interfere
 * with rendering.
 *
 * The renderer is pure and synchronous in practice; the port returns
 * a `Promise<string>` for parity with the PDF / archive adapters.
 */
export class TemplateHtmlRenderer implements HtmlRenderer {
  async wrapForExport(
    html: string,
    options: Readonly<{
      includeFrontMatter: boolean;
      frontMatter: FrontMatter;
      designTokens: Readonly<Record<string, string>>;
    }>,
  ): Promise<string> {
    const styleBlock = renderTokenStyle(options.designTokens);
    const frontMatterBlock = options.includeFrontMatter
      ? renderFrontMatterComment(options.frontMatter)
      : "";

    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      "<title>Export</title>",
      styleBlock,
      "</head>",
      "<body>",
      frontMatterBlock,
      '<main class="export-body">',
      html,
      "</main>",
      "</body>",
      "</html>",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  }
}

function renderTokenStyle(tokens: Readonly<Record<string, string>>): string {
  const entries = Object.entries(tokens);
  if (entries.length === 0) return "";
  // Keys already carry the `--` prefix by the `DesignTokens` VO contract
  // (`DESIGN_TOKEN_KEY_REGEX = /^--[a-z0-9-]+$/`), so we emit them verbatim
  // rather than re-prefixing. `escapeCssIdent` stays as defense-in-depth for
  // any stray character that slipped past the VO.
  const declarations = entries
    .map(
      ([key, value]) => `  ${escapeCssIdent(key)}: ${escapeCssValue(value)};`,
    )
    .join("\n");
  return `<style>\n:root {\n${declarations}\n}\n</style>`;
}

function escapeCssIdent(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "-");
}

function escapeCssValue(raw: string): string {
  // The primary guard is the `DesignTokens` VO / `BUILTIN_DESIGN_TOKENS`,
  // which forbid `[\n\r;{}]` in values — so `;`, `{`, `}`, and newlines
  // cannot reach a declaration here. This stays as a second-layer safeguard
  // that neutralises CSS comment markers (`/*`, `*/`) and newlines should a
  // value ever bypass the VO.
  return raw
    .replace(/\/\*/g, "")
    .replace(/\*\//g, "")
    .replace(/[\r\n]+/g, " ");
}

function renderFrontMatterComment(fm: FrontMatter): string {
  const keys = Object.keys(fm);
  if (keys.length === 0) return "";
  const lines = ["<!--", "---"];
  for (const key of keys) {
    lines.push(`${key}: ${renderFrontMatterValue(fm[key])}`);
  }
  lines.push("---", "-->");
  return lines.join("\n");
}

function renderFrontMatterValue(value: FrontMatterValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => JSON.stringify(entry)).join(", ")}]`;
  }
  return JSON.stringify(value);
}
