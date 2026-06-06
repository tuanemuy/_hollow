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

// URL-safety named entities: only those that decode to characters meaningful
// to scheme/authority parsing (`/`, `\`, `:`) or that browsers strip from a
// URL (Tab/LF). `amp` is kept so a double-encoded `&#x26;sol;` decodes (in one
// pass) to the literal `&sol;` — matching the browser, which treats that as a
// relative path, not `/`. Deliberately NOT the `toPlainText` table: this is a
// browser-URL-interpretation approximation, decoupled from display decoding
// (ADR-002). Safety does not rely on this list being exhaustive — the fallback
// in `isSafeUrl` fails closed on unknown named refs (ADR-001).
const URL_NAMED_ENTITIES: Readonly<Record<string, string>> = {
  sol: "/",
  bsol: "\\",
  colon: ":",
  Tab: "\t",
  NewLine: "\n",
  amp: "&",
};

// Approximate how a browser decodes/normalises an attribute value before
// interpreting it as a URL, so `isSafeUrl` judges what the browser would
// actually navigate to rather than the raw entity-encoded text (Issue #531).
const normalizeUrlForSafetyCheck = (raw: string): string => {
  // Single-pass decode over numeric and named refs in one alternation. A
  // browser decodes each entity exactly once; a sequential two-pass decode
  // would turn `&#x26;sol;` into `&sol;` and then `/`, over-rejecting a value
  // the browser keeps literal (ADR-003).
  const decoded = raw.replace(
    /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*)(;)?/g,
    (match, body: string, semi: string | undefined) => {
      if (body.startsWith("#")) {
        // Numeric refs: browsers decode these even without the trailing `;`
        // (e.g. `&#106avascript` -> `javascript`), so the semicolon is
        // optional here. Hex (`#x`/`#X`) and zero-padding are absorbed by
        // parseInt.
        const isHex = body[1] === "x" || body[1] === "X";
        const cp = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        if (Number.isFinite(cp) && cp > 0 && cp < 0x110000) {
          try {
            return String.fromCodePoint(cp);
          } catch {
            return match;
          }
        }
        return match;
      }
      // Named refs are case-sensitive (`&colon;`=U+003A != `&Colon;`=U+2237)
      // and only decode with the trailing `;`. Unknown / `;`-less names are
      // left literal; the fallback in `isSafeUrl` fails closed on them.
      if (semi === undefined) return match;
      const replacement = URL_NAMED_ENTITIES[body];
      return replacement ?? match;
    },
  );
  // Browsers strip Tab/LF/CR from the whole URL before scheme parsing, then
  // strip leading C0 controls (U+0000–U+001F) and spaces. `trim()` alone
  // leaves U+0001–U+0008 / U+000E–U+001F in place, so a numeric ref like
  // `&#1;//evil.com` would dodge the protocol-relative check — strip the
  // leading C0 range explicitly (ADR-004).
  return decoded
    .replace(/[\t\n\r]/g, "")
    .replace(LEADING_C0_OR_SPACE, "")
    .trimEnd();
};

// Leading C0 control characters (U+0000-U+001F) and space, which a browser
// strips from the front of a URL (ADR-004).
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the C0 control range a browser strips from a URL leader is the intent.
const LEADING_C0_OR_SPACE = /^[\u0000-\u0020]+/;

// Names that the URL-safety decoder leaves literal (not in URL_NAMED_ENTITIES).
// In the scheme/authority region of a bare-relative value, such a residual
// named ref is something a browser might decode to a dangerous char while we
// did not — fail closed (ADR-001 fallback B).
const UNKNOWN_NAMED_REF = /&([a-zA-Z][a-zA-Z0-9]*);/g;

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
  // Judge the value a browser would navigate to, not the raw entity-encoded
  // text — `&#47;&#47;evil.com` / `&sol;&sol;evil.com` / `javascript&colon;…`
  // otherwise slip past the checks below (Issue #531).
  const value = normalizeUrlForSafetyCheck(raw);
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
    // as relative path (e.g. `foo/bar`). Fallback B (fail-closed): if the
    // scheme/authority region (up to the first `/`, `?` or `#`) still holds
    // an *unknown* named ref, a browser might decode it to a dangerous char
    // we did not, so reject. Known named refs that survived (double-encoded
    // `&#x26;sol;` -> literal `&sol;`) and numeric refs stay literal in the
    // browser too, so they are excluded; only explicit-scheme values reach
    // the allowlist below and never get here (ADR-001/003).
    const region = value.slice(0, firstSeparatorIndex(value));
    for (const [, name] of region.matchAll(UNKNOWN_NAMED_REF)) {
      if (URL_NAMED_ENTITIES[name] === undefined) return false;
    }
    return true;
  }
  const scheme = value.slice(0, colonIdx + 1).toLowerCase();
  return SAFE_URL_SCHEMES.has(scheme);
};

// Index of the first `/`, `?` or `#` (the scheme/authority boundary), or the
// string length if none is present.
const firstSeparatorIndex = (value: string): number => {
  const m = value.match(/[/?#]/);
  return m?.index ?? value.length;
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
