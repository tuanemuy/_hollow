/**
 * Pure pretty-print / minify utilities for the note editor's HTML tab
 * (Issue #762).
 *
 * The HTML tab persists a *minified* `contentHtml` (the same compact form
 * `htmlSanitizer.renderSync` emits server-side), but shows the user an
 * indented, line-broken view while editing. `formatHtml` produces that
 * readable view; `minifyHtml` collapses it back to the compact form that
 * gets persisted. The pair is the single source of truth for the
 * "display is formatted / saved is minified" asymmetry.
 *
 * Implementation (ADR-001): both functions parse with `ultrahtml.parse`
 * — the same parser the server sanitiser uses, so the minified output
 * lines up with the persisted representation — and walk the resulting AST
 * with a bespoke recursive serializer that mirrors `ultrahtml`'s own
 * `renderSync`. The AST is read-only; nodes are never mutated, so the
 * functions stay pure (React-agnostic, side-effect-free, no throw — a
 * parse failure falls back to returning the input unchanged so a
 * half-typed fragment is never lost, AC-8).
 *
 * Whitespace normalisation rules (ADR-001 / plan §設計, the SSOT that
 * format and minify follow in lockstep):
 *
 *   1. A *block container* whose children are all block nodes (or
 *      whitespace-only TEXT) may have indentation / newlines inserted
 *      (format) or removed (minify) between its children. Whitespace-only
 *      TEXT is treated as formatting whitespace and dropped on minify.
 *   2. A container with even one inline child is left untouched inside —
 *      its text (including meaningful inter-element spaces like the `" "`
 *      in `<a>x</a> <a>y</a>`) is serialized verbatim (AC-5).
 *   3. `<pre>` / `<code>` / `<textarea>` are whitespace-significant: their
 *      entire subtree is serialized verbatim, no whitespace added/removed
 *      (AC-4). `<textarea>` is dropped by the server allowlist, but AC-4
 *      lists it, so it is honoured here.
 *   4. The block / inline / whitespace-significant tag sets below are kept
 *      in lockstep with `htmlSanitizer.ts`'s `BLOCK_TAGS` / `INLINE_TAGS`
 *      (manual curation, mirroring `wysiwygUnsupportedTags.ts`).
 *
 * Invariant fixed by tests: `minifyHtml(formatHtml(m)) === m` for any
 * minified input `m` (S-002).
 */

import {
  COMMENT_NODE,
  DOCTYPE_NODE,
  DOCUMENT_NODE,
  ELEMENT_NODE,
  type Node,
  parse,
  TEXT_NODE,
} from "ultrahtml";

// Tags whose children participate in block-level formatting. Kept in
// lockstep with `htmlSanitizer.ts`'s `BLOCK_TAGS` (minus the
// whitespace-significant `pre` / `code`, which are handled separately).
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "p",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
  "section",
  "article",
  "figure",
  "figcaption",
]);

// Void block elements (no children) that still sit at block level. `hr` /
// `br` self-close; rendered on their own line inside a block container.
const VOID_BLOCK_TAGS: ReadonlySet<string> = new Set(["hr"]);

// Whitespace-significant elements: their subtree is emitted verbatim and
// never formatted (AC-4). Mirrors the sanitiser's treatment of `pre` /
// `code` plus `textarea` (AC-4 lists it even though the allowlist drops
// it server-side).
const WHITESPACE_SIGNIFICANT_TAGS: ReadonlySet<string> = new Set([
  "pre",
  "code",
  "textarea",
]);

const INDENT_UNIT = "  ";

function isWhitespaceOnlyText(node: Node): boolean {
  return node.type === TEXT_NODE && node.value.trim().length === 0;
}

function isBlockElement(node: Node): boolean {
  return (
    node.type === ELEMENT_NODE &&
    (BLOCK_TAGS.has(node.name) || VOID_BLOCK_TAGS.has(node.name))
  );
}

/**
 * A container is block-formattable when every child is either a block
 * element, a comment, or whitespace-only text — i.e. no inline content
 * whose surrounding whitespace would be meaningful (rule 1 / 2).
 */
function isBlockFormattable(children: readonly Node[]): boolean {
  let hasBlock = false;
  for (const child of children) {
    if (child.type === COMMENT_NODE) continue;
    if (isWhitespaceOnlyText(child)) continue;
    if (isBlockElement(child)) {
      hasBlock = true;
      continue;
    }
    return false;
  }
  return hasBlock;
}

function renderAttributes(attributes: Record<string, string>): string {
  let out = "";
  for (const [name, value] of Object.entries(attributes)) {
    out += ` ${name}="${value}"`;
  }
  return out;
}

// Void elements `ultrahtml` self-closes (mirrors its internal VOID set).
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Verbatim serializer mirroring `ultrahtml.renderSync` (no formatting). */
function renderVerbatim(node: Node): string {
  switch (node.type) {
    case DOCUMENT_NODE:
      return node.children.map(renderVerbatim).join("");
    case ELEMENT_NODE: {
      const open = `<${node.name}${renderAttributes(node.attributes)}`;
      if (VOID_ELEMENTS.has(node.name)) return `${open}>`;
      const inner = node.children.map(renderVerbatim).join("");
      return `${open}>${inner}</${node.name}>`;
    }
    case TEXT_NODE:
      return node.value;
    case COMMENT_NODE:
      return `<!--${node.value}-->`;
    case DOCTYPE_NODE:
      return `<!${node.value}>`;
    default:
      return "";
  }
}

function formatNode(node: Node, depth: number): string {
  switch (node.type) {
    case DOCUMENT_NODE:
      return formatChildren(node.children, depth);
    case ELEMENT_NODE: {
      const open = `<${node.name}${renderAttributes(node.attributes)}`;
      if (VOID_ELEMENTS.has(node.name)) return `${open}>`;
      if (WHITESPACE_SIGNIFICANT_TAGS.has(node.name)) {
        const inner = node.children.map(renderVerbatim).join("");
        return `${open}>${inner}</${node.name}>`;
      }
      if (isBlockFormattable(node.children)) {
        const indent = INDENT_UNIT.repeat(depth + 1);
        const lines = node.children
          .filter((c) => !isWhitespaceOnlyText(c))
          .map((c) => `${indent}${formatNode(c, depth + 1)}`)
          .join("\n");
        const closeIndent = INDENT_UNIT.repeat(depth);
        return `${open}>\n${lines}\n${closeIndent}</${node.name}>`;
      }
      // Inline content: serialize verbatim so inter-element spaces survive.
      const inner = node.children.map(renderVerbatim).join("");
      return `${open}>${inner}</${node.name}>`;
    }
    case TEXT_NODE:
      return node.value;
    case COMMENT_NODE:
      return `<!--${node.value}-->`;
    case DOCTYPE_NODE:
      return `<!${node.value}>`;
    default:
      return "";
  }
}

function formatChildren(children: readonly Node[], depth: number): string {
  if (isBlockFormattable(children)) {
    const indent = INDENT_UNIT.repeat(depth);
    return children
      .filter((c) => !isWhitespaceOnlyText(c))
      .map((c) => `${indent}${formatNode(c, depth)}`)
      .join("\n");
  }
  return children.map((c) => formatNode(c, depth)).join("");
}

/**
 * Pretty-print minified `contentHtml` into an indented, line-broken view
 * for the HTML edit tab. Returns the input unchanged on parse failure
 * (AC-8). Pure: never mutates the AST, never throws.
 */
export function formatHtml(html: string): string {
  if (html.length === 0) return html;
  try {
    const root = parse(html) as Node;
    return formatChildren(root.children, 0);
  } catch {
    return html;
  }
}

/**
 * Collapse a (possibly formatted) HTML string back to the compact
 * minified form that gets persisted. Drops formatting whitespace inserted
 * between block children while preserving inline inter-element spaces and
 * whitespace-significant subtrees. Returns the input unchanged on parse
 * failure (AC-8). Pure: never mutates the AST, never throws.
 */
export function minifyHtml(html: string): string {
  if (html.length === 0) return html;
  try {
    const root = parse(html) as Node;
    return minifyChildren(root.children);
  } catch {
    return html;
  }
}

function minifyNode(node: Node): string {
  switch (node.type) {
    case DOCUMENT_NODE:
      return minifyChildren(node.children);
    case ELEMENT_NODE: {
      const open = `<${node.name}${renderAttributes(node.attributes)}`;
      if (VOID_ELEMENTS.has(node.name)) return `${open}>`;
      if (WHITESPACE_SIGNIFICANT_TAGS.has(node.name)) {
        const inner = node.children.map(renderVerbatim).join("");
        return `${open}>${inner}</${node.name}>`;
      }
      return `${open}>${minifyChildren(node.children)}</${node.name}>`;
    }
    case TEXT_NODE:
      return node.value;
    case COMMENT_NODE:
      return `<!--${node.value}-->`;
    case DOCTYPE_NODE:
      return `<!${node.value}>`;
    default:
      return "";
  }
}

function minifyChildren(children: readonly Node[]): string {
  // Drop whitespace-only TEXT between block children (formatting
  // whitespace, rule 1); preserve everything else verbatim so inline
  // inter-element spaces survive (rule 2).
  if (isBlockFormattable(children)) {
    return children
      .filter((c) => !isWhitespaceOnlyText(c))
      .map(minifyNode)
      .join("");
  }
  return children.map(minifyNode).join("");
}
