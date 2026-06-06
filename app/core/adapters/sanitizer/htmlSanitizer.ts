import {
  COMMENT_NODE,
  DOCTYPE_NODE,
  ELEMENT_NODE,
  type ElementNode,
  type Node,
  parse,
  renderSync,
  TEXT_NODE,
} from "ultrahtml";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type {
  HtmlSanitizer,
  SanitizePolicy,
  SanitizeRemoval,
  SanitizeResult,
} from "@/core/domain/note/ports/htmlSanitizer";
import { ContentHtml } from "@/core/domain/note/valueObject";

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

const decodeEntities = (raw: string): string =>
  raw.replace(/&(#?[a-z0-9]+);/gi, (match, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("#")) {
      const isHex = lower.startsWith("#x");
      const codepoint = Number.parseInt(
        lower.slice(isHex ? 2 : 1),
        isHex ? 16 : 10,
      );
      if (Number.isFinite(codepoint) && codepoint > 0 && codepoint < 0x110000) {
        try {
          return String.fromCodePoint(codepoint);
        } catch {
          return match;
        }
      }
      return match;
    }
    return HTML_ENTITIES[lower] ?? match;
  });

// Allowlist-based sanitiser over the ultrahtml AST. ultrahtml parses the
// raw HTML, and a recursive transform keeps only allowlisted tags /
// attributes, then `renderSync` re-serialises. The Cloudflare Workers
// runtime allows ultrahtml (pure ESM, no Node / DOM deps), so the bundle
// stays free of polyfills.
//
// Defence layers ultrahtml does NOT provide and we keep ourselves:
//
// - URL schemes are restricted to a fixed allowlist (`http`, `https`,
//   `mailto`, plus relative paths) — ultrahtml does not validate URLs.
// - `on*` event-handler attributes are stripped unconditionally.
// - `renderSync` re-emits attribute values and text verbatim — it does
//   NOT re-escape. A raw `"` in an attribute value would break out of
//   the quoted attribute and inject a live handler, so we escape `"` in
//   attribute values and `<` / `>` in text ourselves. `&` is left as-is
//   because ultrahtml keeps entities literal (`&amp;` stays `&amp;`),
//   so escaping it would double-encode markdown-it output.
// - Disallowed elements are dropped subtree-and-all. Raw-text elements
//   (`<script>` / `<style>`) expose their body as a text child, so
//   unwrapping a disallowed node could re-emit live markup. Dropping the
//   whole subtree fails closed. Pipeline inputs (markdown-it with
//   `html:false`, TipTap) never emit disallowed tags, so no legitimate
//   content is lost.
// - `[[...]]` placeholders live in text content and pass through as
//   plain text. The policy flag `allowInternalLinks` is advisory only;
//   placeholders are never stripped here regardless of its value (the
//   link-extraction pass downstream owns that distinction).

type AttrAllowlist = ReadonlySet<string>;

const BLOCK_TAGS: AttrAllowlist = new Set([
  "p",
  "br",
  "hr",
  "blockquote",
  "pre",
  "code",
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
  "span",
  "section",
  "article",
]);

const INLINE_TAGS: AttrAllowlist = new Set([
  "a",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "sub",
  "sup",
  "mark",
  "small",
  "kbd",
  "abbr",
  "cite",
  "q",
]);

const MEDIA_TAGS: AttrAllowlist = new Set([
  "img",
  "video",
  "audio",
  "source",
  "figure",
  "figcaption",
]);

const GLOBAL_ATTRS: AttrAllowlist = new Set([
  "id",
  "class",
  "title",
  "lang",
  "dir",
  "data-internal-link",
]);

const ATTR_ALLOW: Readonly<Record<string, AttrAllowlist>> = {
  a: new Set(["href", "rel", "target"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  video: new Set(["src", "controls", "poster", "width", "height"]),
  audio: new Set(["src", "controls"]),
  source: new Set(["src", "type"]),
  th: new Set(["scope", "colspan", "rowspan"]),
  td: new Set(["colspan", "rowspan"]),
  ol: new Set(["start", "type"]),
};

const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

const isAllowedTag = (tag: string, policy: SanitizePolicy): boolean => {
  if (BLOCK_TAGS.has(tag) || INLINE_TAGS.has(tag)) return true;
  if (policy.allowMedia && MEDIA_TAGS.has(tag)) return true;
  return false;
};

const isAllowedAttr = (tag: string, attr: string): boolean => {
  if (GLOBAL_ATTRS.has(attr)) return true;
  return ATTR_ALLOW[tag]?.has(attr) === true;
};

const isSafeUrl = (raw: string): boolean => {
  const value = raw.trim();
  if (value.length === 0) return false;
  // Protocol-relative URLs (`//host`, plus the backslash variants browsers
  // normalise to `//`) resolve to an external host. They carry no scheme
  // colon, so the allowlist below would mis-classify them as relative paths
  // and admit them — reject here directly.
  if (/^[/\\]{2}/.test(value)) return false;
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("?")) {
    return true;
  }
  if (value.startsWith(".")) return true;
  // Pattern: scheme:rest — anchored at start. Use a length-bounded
  // lookup so URL parsing is not required.
  const colonIdx = value.indexOf(":");
  if (colonIdx <= 0) {
    // No scheme present and not a recognised relative form above; treat
    // as relative path (e.g. `foo/bar`).
    return true;
  }
  const scheme = value.slice(0, colonIdx + 1).toLowerCase();
  return SAFE_URL_SCHEMES.has(scheme);
};

// `renderSync` does not escape, so we escape just enough to stop a value
// breaking out of its context. `&` is intentionally untouched (ultrahtml
// keeps entities literal; escaping it would double-encode).
const escapeAttrValue = (value: string): string =>
  value.replace(/"/g, "&quot;");

const escapeTextValue = (value: string): string =>
  value.replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sanitizeAttributes = (
  node: ElementNode,
  removed: SanitizeRemoval[],
): Record<string, string> => {
  const clean: Record<string, string> = {};
  for (const [name, value] of Object.entries(node.attributes)) {
    if (!isAllowedAttr(node.name, name)) {
      removed.push({ tag: node.name, reason: `disallowed attribute: ${name}` });
      continue;
    }
    if (name.startsWith("on")) {
      // Defensive: the allowlists do not list event handlers, but never
      // let `onclick=` etc. slip through even if widened later.
      removed.push({
        tag: node.name,
        reason: `event handler stripped: ${name}`,
      });
      continue;
    }
    if ((name === "href" || name === "src") && !isSafeUrl(value)) {
      removed.push({ tag: node.name, reason: `unsafe URL scheme: ${name}` });
      continue;
    }
    clean[name] = escapeAttrValue(value);
  }
  return clean;
};

const sanitizeChildren = (
  nodes: readonly Node[],
  policy: SanitizePolicy,
  removed: SanitizeRemoval[],
): Node[] => {
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.type === TEXT_NODE) {
      out.push({ ...node, value: escapeTextValue(node.value) });
      continue;
    }
    if (node.type === COMMENT_NODE || node.type === DOCTYPE_NODE) {
      continue;
    }
    if (node.type === ELEMENT_NODE) {
      if (!isAllowedTag(node.name, policy)) {
        removed.push({ tag: node.name, reason: "disallowed tag" });
        continue;
      }
      out.push({
        ...node,
        attributes: sanitizeAttributes(node, removed),
        children: sanitizeChildren(node.children, policy, removed),
      });
    }
  }
  return out;
};

class UltrahtmlHtmlSanitizer implements HtmlSanitizer {
  toPlainText(html: ContentHtml): string {
    try {
      // Strip every tag; collapse runs of whitespace produced by the
      // surrounding markup so the resulting body is index-friendly.
      const stripped = (html as string).replace(/<[^>]*>/g, " ");
      const decoded = decodeEntities(stripped);
      return decoded.replace(/\s+/g, " ").trim();
    } catch (cause) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Failed to project HTML to plain text",
        cause,
      );
    }
  }

  sanitize(rawHtml: string, policy: SanitizePolicy): SanitizeResult {
    try {
      const removed: SanitizeRemoval[] = [];
      const root = parse(rawHtml) as Node & { children: Node[] };
      const sanitized = {
        ...root,
        children: sanitizeChildren(root.children, policy, removed),
      };
      return {
        html: ContentHtml.create(renderSync(sanitized)),
        removed,
      };
    } catch (cause) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Failed to sanitize HTML",
        cause,
      );
    }
  }
}

export { UltrahtmlHtmlSanitizer };
