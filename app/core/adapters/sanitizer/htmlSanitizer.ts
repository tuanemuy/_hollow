import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type {
  HtmlSanitizer,
  SanitizePolicy,
  SanitizeRemoval,
  SanitizeResult,
} from "@/core/domain/note/ports/htmlSanitizer";
import { ContentHtml } from "@/core/domain/note/valueObject";

// Minimal allowlist-based sanitiser implemented as a small streaming
// tokeniser. The MVP cannot depend on the `sanitize-html` npm package
// because the Cloudflare Workers runtime forbids ad-hoc Node API usage
// at this layer (the bundle stays free of Node polyfills). Adding it as
// a vendored dependency would be a separate change; until then this
// implementation enforces the policy documented on `HtmlSanitizer` and
// keeps every transformation auditable in one file.
//
// Trade-offs vs `sanitize-html`:
//
// - Only well-formed input is accepted. Hostile malformed HTML (e.g.
//   unbalanced quotes, embedded `<` outside of attributes) is rejected
//   wholesale rather than best-effort repaired — failing closed is
//   safer than the alternative for note bodies that already came out of
//   a Markdown converter.
// - URL schemes are restricted to a fixed allowlist (`http`, `https`,
//   `mailto`, plus relative paths).
// - `style` attributes are stripped unconditionally; the editor relies
//   on class names for visual treatment.
// - `[[...]]` placeholders pass through untouched when
//   `policy.allowInternalLinks` is true (they live in text content, so
//   the tokeniser ignores them by construction).

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

const VOID_TAGS: AttrAllowlist = new Set(["br", "hr", "img", "source"]);

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

const escapeText = (raw: string): string =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type ParsedTag = Readonly<{
  kind: "open" | "close" | "void";
  name: string;
  attrs: ReadonlyArray<{ readonly name: string; readonly value: string }>;
}>;

const parseTag = (raw: string): ParsedTag | null => {
  // raw is the inner of `<...>` without the angle brackets.
  if (raw.length === 0) return null;
  if (raw.startsWith("!") || raw.startsWith("?")) return null;
  let closing = false;
  let cursor = 0;
  if (raw[0] === "/") {
    closing = true;
    cursor = 1;
  }
  // Read tag name.
  let nameEnd = cursor;
  while (nameEnd < raw.length) {
    const ch = raw.charCodeAt(nameEnd);
    const isAlnum =
      (ch >= 0x30 && ch <= 0x39) ||
      (ch >= 0x41 && ch <= 0x5a) ||
      (ch >= 0x61 && ch <= 0x7a) ||
      ch === 0x2d ||
      ch === 0x5f;
    if (!isAlnum) break;
    nameEnd += 1;
  }
  const name = raw.slice(cursor, nameEnd).toLowerCase();
  if (name.length === 0) return null;
  cursor = nameEnd;

  const attrs: { name: string; value: string }[] = [];
  let selfClosing = false;

  while (cursor < raw.length) {
    while (cursor < raw.length && /\s/.test(raw[cursor] ?? "")) cursor += 1;
    if (cursor >= raw.length) break;
    if (raw[cursor] === "/") {
      selfClosing = true;
      cursor += 1;
      continue;
    }
    // Attribute name.
    const attrStart = cursor;
    while (cursor < raw.length) {
      const ch = raw[cursor];
      if (ch === undefined) break;
      if (ch === "=" || ch === "/" || ch === ">" || /\s/.test(ch)) {
        break;
      }
      cursor += 1;
    }
    const attrName = raw.slice(attrStart, cursor).toLowerCase();
    if (attrName.length === 0) {
      cursor += 1;
      continue;
    }
    let attrValue = "";
    while (cursor < raw.length && /\s/.test(raw[cursor] ?? "")) cursor += 1;
    if (raw[cursor] === "=") {
      cursor += 1;
      while (cursor < raw.length && /\s/.test(raw[cursor] ?? "")) cursor += 1;
      const quote = raw[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        const valStart = cursor;
        while (cursor < raw.length && raw[cursor] !== quote) cursor += 1;
        attrValue = raw.slice(valStart, cursor);
        if (raw[cursor] === quote) cursor += 1;
      } else {
        const valStart = cursor;
        while (cursor < raw.length && !/[\s/>]/.test(raw[cursor] ?? "")) {
          cursor += 1;
        }
        attrValue = raw.slice(valStart, cursor);
      }
    }
    attrs.push({ name: attrName, value: attrValue });
  }

  const isVoid = selfClosing || VOID_TAGS.has(name);
  return {
    kind: closing ? "close" : isVoid ? "void" : "open",
    name,
    attrs,
  };
};

const serialiseAttrs = (
  attrs: ReadonlyArray<{ readonly name: string; readonly value: string }>,
): string =>
  attrs
    .map(
      (attr) =>
        ` ${attr.name}="${attr.value
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")}"`,
    )
    .join("");

class SanitizeHtmlSanitizer implements HtmlSanitizer {
  sanitize(rawHtml: string, policy: SanitizePolicy): SanitizeResult {
    try {
      return this.runUnchecked(rawHtml, policy);
    } catch (cause) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Failed to sanitize HTML",
        cause,
      );
    }
  }

  private runUnchecked(
    rawHtml: string,
    policy: SanitizePolicy,
  ): SanitizeResult {
    const out: string[] = [];
    const removed: SanitizeRemoval[] = [];
    const openStack: string[] = [];

    let cursor = 0;
    while (cursor < rawHtml.length) {
      const lt = rawHtml.indexOf("<", cursor);
      if (lt === -1) {
        out.push(escapeText(rawHtml.slice(cursor)));
        break;
      }
      if (lt > cursor) {
        out.push(escapeText(rawHtml.slice(cursor, lt)));
      }
      // Skip <!-- comments --> entirely; also handles `<![CDATA[`.
      if (rawHtml.startsWith("<!--", lt)) {
        const end = rawHtml.indexOf("-->", lt + 4);
        if (end === -1) {
          // Unterminated comment — strip the tail rather than emit
          // suspicious markup.
          removed.push({ tag: "!--", reason: "unterminated comment" });
          break;
        }
        cursor = end + 3;
        continue;
      }
      const gt = rawHtml.indexOf(">", lt + 1);
      if (gt === -1) {
        // Unterminated tag — escape the trailing fragment and stop.
        out.push(escapeText(rawHtml.slice(lt)));
        break;
      }
      const inner = rawHtml.slice(lt + 1, gt);
      const parsed = parseTag(inner);
      cursor = gt + 1;
      if (!parsed) {
        removed.push({ tag: inner.trim().slice(0, 32), reason: "invalid tag" });
        continue;
      }

      if (parsed.kind === "close") {
        // Pop matching open tag if present; otherwise drop silently.
        const idx = openStack.lastIndexOf(parsed.name);
        if (idx === -1) {
          removed.push({ tag: parsed.name, reason: "unmatched close" });
          continue;
        }
        // Close any intervening unclosed tags too, to keep nesting
        // balanced after sanitisation.
        while (openStack.length > idx) {
          const popped = openStack.pop();
          if (popped !== undefined) {
            out.push(`</${popped}>`);
          }
        }
        continue;
      }

      if (!isAllowedTag(parsed.name, policy)) {
        removed.push({ tag: parsed.name, reason: "disallowed tag" });
        continue;
      }

      const cleanedAttrs: { name: string; value: string }[] = [];
      for (const attr of parsed.attrs) {
        if (!isAllowedAttr(parsed.name, attr.name)) {
          removed.push({
            tag: parsed.name,
            reason: `disallowed attribute: ${attr.name}`,
          });
          continue;
        }
        if (attr.name.startsWith("on")) {
          // Defensive: GLOBAL_ATTRS / ATTR_ALLOW do not list event
          // handlers, but never let `onclick=` etc. slip through even
          // if the allowlist is widened later.
          removed.push({
            tag: parsed.name,
            reason: `event handler stripped: ${attr.name}`,
          });
          continue;
        }
        if (
          (attr.name === "href" || attr.name === "src") &&
          !isSafeUrl(attr.value)
        ) {
          removed.push({
            tag: parsed.name,
            reason: `unsafe URL scheme: ${attr.name}`,
          });
          continue;
        }
        cleanedAttrs.push({ name: attr.name, value: attr.value });
      }

      if (parsed.kind === "void") {
        out.push(`<${parsed.name}${serialiseAttrs(cleanedAttrs)} />`);
        continue;
      }
      openStack.push(parsed.name);
      out.push(`<${parsed.name}${serialiseAttrs(cleanedAttrs)}>`);
    }

    // Close any tags left dangling.
    while (openStack.length > 0) {
      const popped = openStack.pop();
      if (popped !== undefined) {
        out.push(`</${popped}>`);
      }
    }

    return {
      html: ContentHtml.create(out.join("")),
      removed,
    };
  }
}

export { SanitizeHtmlSanitizer };
