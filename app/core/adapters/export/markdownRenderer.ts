import type { MarkdownRenderer } from "@/core/domain/export/ports/markdownRenderer";
import type {
  FrontMatter,
  FrontMatterValue,
} from "@/core/domain/note/valueObject";

/**
 * Minimal Markdown renderer adapter.
 *
 * The MVP transformation is intentionally narrow: the canonical content
 * HTML is reduced to a text/Markdown projection by stripping inline tags
 * and translating block boundaries to blank lines. Inline media,
 * hashtags, and internal links are passed through as their textual
 * content — the round-trip story tracked on the port doc is a
 * post-MVP concern.
 *
 * The renderer is pure and synchronous in practice; the port returns a
 * `Promise<string>` for parity with the PDF / archive adapters that
 * legitimately need async work.
 */
export class HtmlToMarkdownRenderer implements MarkdownRenderer {
  async fromHtml(
    html: string,
    options: Readonly<{
      includeFrontMatter: boolean;
      frontMatter: FrontMatter;
    }>,
  ): Promise<string> {
    const body = htmlToMarkdown(html);
    if (!options.includeFrontMatter) {
      return body;
    }
    const fm = renderFrontMatter(options.frontMatter);
    return fm.length === 0 ? body : `${fm}\n${body}`;
  }
}

function htmlToMarkdown(html: string): string {
  // Block-level boundaries become blank lines; `<br>` becomes a single
  // newline. Remaining tags are stripped so the result is a faithful
  // text projection. Numeric/named entities are decoded for the common
  // cases that round-trip through our pipeline; uncommon entities are
  // left as-is and decoded by the consuming Markdown viewer.
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(
      /<\s*\/?\s*(p|div|section|article|li|h[1-6]|blockquote|pre|tr|table|thead|tbody)\b[^>]*>/gi,
      "\n\n",
    );
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  const decoded = decodeBasicEntities(stripped);
  return decoded.replace(/\n{3,}/g, "\n\n").trim();
}

const ENTITY_MAP: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeBasicEntities(input: string): string {
  return input.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (raw, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const code = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
      }
      if (body.startsWith("#")) {
        const code = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
      }
      const mapped = ENTITY_MAP[body.toLowerCase()];
      return mapped ?? raw;
    },
  );
}

function renderFrontMatter(fm: FrontMatter): string {
  const keys = Object.keys(fm);
  if (keys.length === 0) return "";
  const lines: string[] = ["---"];
  for (const key of keys) {
    lines.push(`${key}: ${renderFrontMatterValue(fm[key])}`);
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
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
