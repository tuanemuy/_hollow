import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type { MarkdownConverter } from "@/core/domain/note/ports/markdownConverter";

// Pragmatic Markdown → HTML conversion implemented inline for the same
// reason as the sanitiser: keeping the bundle free of Node-only deps.
// The output is not a full CommonMark renderer — it covers the subset
// the editor emits when the user types Markdown rather than rich text:
//
// - ATX headings (`# `..`###### `) → `<h1>`..`<h6>`
// - Fenced code blocks (triple backtick) → `<pre><code>`
// - Unordered list items beginning with `- ` / `* ` → `<ul><li>`
// - Ordered list items beginning with `\d+. ` → `<ol><li>`
// - Blockquote lines beginning with `> ` → `<blockquote>`
// - Horizontal rule lines of `---` / `***` → `<hr>`
// - Paragraphs (text separated by blank lines) → `<p>`
// - Inline: `**bold**`, `*italic*`, `` `code` ``, `[label](url)`,
//   `[[wikilink]]` is preserved verbatim for the link-extraction pass.
//
// Anything not recognised flows through as escaped text so the output
// stays well-formed for the sanitiser. The output of this converter is
// not yet a `ContentHtml` — the caller must pass it through
// `HtmlSanitizer.sanitize`.

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const FENCE_RE = /^```\s*([\w-]*)\s*$/;
const UL_RE = /^[-*]\s+(.+)$/;
const OL_RE = /^(\d{1,9})\.\s+(.+)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderInline = (raw: string): string => {
  // Apply transformations as a single pass over the string, building a
  // result buffer character-by-character so each rule consumes its own
  // window without leaving partial state for the next iteration. The
  // order matches Markdown precedence: code spans first (their content
  // is not re-interpreted), then links, then strong/em.

  type Token = Readonly<{ html: string; consumed: number }>;
  const tryToken = (input: string, idx: number): Token | null => {
    const ch = input[idx];
    if (ch === "`") {
      const end = input.indexOf("`", idx + 1);
      if (end !== -1) {
        return {
          html: `<code>${escapeHtml(input.slice(idx + 1, end))}</code>`,
          consumed: end - idx + 1,
        };
      }
    }
    // [[wikilink]] — preserve verbatim so the link extractor can
    // recognise it post-sanitisation. The brackets must round-trip
    // through HTML, so we escape just enough to keep them as text.
    if (ch === "[" && input[idx + 1] === "[") {
      const end = input.indexOf("]]", idx + 2);
      if (end !== -1) {
        return {
          html: escapeHtml(input.slice(idx, end + 2)),
          consumed: end + 2 - idx,
        };
      }
    }
    if (ch === "[") {
      const labelEnd = input.indexOf("]", idx + 1);
      if (
        labelEnd !== -1 &&
        input[labelEnd + 1] === "(" &&
        input.indexOf(")", labelEnd + 2) !== -1
      ) {
        const urlEnd = input.indexOf(")", labelEnd + 2);
        const label = input.slice(idx + 1, labelEnd);
        const url = input.slice(labelEnd + 2, urlEnd);
        return {
          html: `<a href="${escapeHtml(url)}">${renderInline(label)}</a>`,
          consumed: urlEnd + 1 - idx,
        };
      }
    }
    if (ch === "*" && input[idx + 1] === "*") {
      const end = input.indexOf("**", idx + 2);
      if (end !== -1) {
        return {
          html: `<strong>${renderInline(input.slice(idx + 2, end))}</strong>`,
          consumed: end + 2 - idx,
        };
      }
    }
    if (ch === "*") {
      const end = input.indexOf("*", idx + 1);
      if (end !== -1) {
        return {
          html: `<em>${renderInline(input.slice(idx + 1, end))}</em>`,
          consumed: end + 1 - idx,
        };
      }
    }
    return null;
  };

  let out = "";
  let cursor = 0;
  while (cursor < raw.length) {
    const token = tryToken(raw, cursor);
    if (token) {
      out += token.html;
      cursor += token.consumed;
      continue;
    }
    out += escapeHtml(raw[cursor] ?? "");
    cursor += 1;
  }
  return out;
};

type Block = Readonly<
  | { kind: "p"; lines: string[] }
  | { kind: "h"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "pre"; lang: string; code: string }
  | { kind: "hr" }
>;

const renderBlock = (block: Block): string => {
  switch (block.kind) {
    case "p":
      return `<p>${renderInline(block.lines.join(" ").trim())}</p>`;
    case "h":
      return `<h${block.level}>${renderInline(block.text.trim())}</h${block.level}>`;
    case "ul":
      return `<ul>${block.items
        .map((item) => `<li>${renderInline(item)}</li>`)
        .join("")}</ul>`;
    case "ol":
      return `<ol>${block.items
        .map((item) => `<li>${renderInline(item)}</li>`)
        .join("")}</ol>`;
    case "quote":
      return `<blockquote><p>${renderInline(block.lines.join(" ").trim())}</p></blockquote>`;
    case "pre": {
      const langClass =
        block.lang.length > 0
          ? ` class="language-${escapeHtml(block.lang)}"`
          : "";
      return `<pre><code${langClass}>${escapeHtml(block.code)}</code></pre>`;
    }
    case "hr":
      return "<hr />";
  }
};

class MarkdownItConverter implements MarkdownConverter {
  async toHtml(markdown: string): Promise<string> {
    try {
      return this.convert(markdown);
    } catch (cause) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Failed to convert markdown to HTML",
        cause,
      );
    }
  }

  private convert(markdown: string): string {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i] ?? "";
      if (line.trim().length === 0) {
        i += 1;
        continue;
      }
      // Fenced code block — closes at the next matching ``` line or EOF.
      const fence = FENCE_RE.exec(line);
      if (fence) {
        const lang = fence[1] ?? "";
        const codeLines: string[] = [];
        i += 1;
        while (i < lines.length && !FENCE_RE.test(lines[i] ?? "")) {
          codeLines.push(lines[i] ?? "");
          i += 1;
        }
        if (i < lines.length) i += 1; // consume closing fence
        blocks.push({ kind: "pre", lang, code: codeLines.join("\n") });
        continue;
      }
      const heading = HEADING_RE.exec(line);
      if (heading) {
        blocks.push({
          kind: "h",
          level: (heading[1] ?? "").length,
          text: heading[2] ?? "",
        });
        i += 1;
        continue;
      }
      if (HR_RE.test(line)) {
        blocks.push({ kind: "hr" });
        i += 1;
        continue;
      }
      if (UL_RE.test(line)) {
        const items: string[] = [];
        while (i < lines.length) {
          const m = UL_RE.exec(lines[i] ?? "");
          if (!m) break;
          items.push(m[1] ?? "");
          i += 1;
        }
        blocks.push({ kind: "ul", items });
        continue;
      }
      if (OL_RE.test(line)) {
        const items: string[] = [];
        while (i < lines.length) {
          const m = OL_RE.exec(lines[i] ?? "");
          if (!m) break;
          items.push(m[2] ?? "");
          i += 1;
        }
        blocks.push({ kind: "ol", items });
        continue;
      }
      if (QUOTE_RE.test(line)) {
        const collected: string[] = [];
        while (i < lines.length) {
          const m = QUOTE_RE.exec(lines[i] ?? "");
          if (!m) break;
          collected.push(m[1] ?? "");
          i += 1;
        }
        blocks.push({ kind: "quote", lines: collected });
        continue;
      }
      // Paragraph: gather contiguous non-blank lines.
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        (lines[i] ?? "").trim().length > 0 &&
        !HEADING_RE.test(lines[i] ?? "") &&
        !FENCE_RE.test(lines[i] ?? "") &&
        !UL_RE.test(lines[i] ?? "") &&
        !OL_RE.test(lines[i] ?? "") &&
        !QUOTE_RE.test(lines[i] ?? "") &&
        !HR_RE.test(lines[i] ?? "")
      ) {
        paraLines.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push({ kind: "p", lines: paraLines });
    }
    return blocks.map(renderBlock).join("\n");
  }
}

export { MarkdownItConverter };
