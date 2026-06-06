import { ELEMENT_NODE, type Node, parse } from "ultrahtml";
import { describe, expect, it } from "vitest";
import type { ContentHtml as ContentHtmlType } from "@/core/domain/note/valueObject";
import { ContentHtml } from "@/core/domain/note/valueObject";
import { UltrahtmlHtmlSanitizer } from "../htmlSanitizer";

const sanitizer = new UltrahtmlHtmlSanitizer();
const FULL = { allowMedia: true, allowInternalLinks: true } as const;
const RESTRICTED = { allowMedia: false, allowInternalLinks: false } as const;

// Re-parse sanitised output the way a browser would and collect every
// element's live attribute names. This proves an injected handler did not
// survive as a real attribute (vs. sitting inside an escaped value).
const liveAttrNames = (html: ContentHtmlType): string[] => {
  const names: string[] = [];
  const visit = (node: Node): void => {
    if (node.type === ELEMENT_NODE) {
      names.push(...Object.keys(node.attributes));
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(parse(html as string));
  return names;
};

describe("UltrahtmlHtmlSanitizer", () => {
  describe("tag allow-list", () => {
    it("preserves allowlisted structural tags", () => {
      const { html, removed } = sanitizer.sanitize(
        "<h2>Heading</h2><p><strong>b</strong> <em>i</em> <s>x</s> <code>c</code></p><ul><li>one</li></ul><blockquote><p>q</p></blockquote>",
        FULL,
      );
      for (const tag of [
        "h2",
        "p",
        "strong",
        "em",
        "s",
        "code",
        "ul",
        "li",
        "blockquote",
      ]) {
        expect(html).toMatch(new RegExp(`<${tag}[\\s/>]`));
      }
      expect(removed.filter((r) => r.reason === "disallowed tag")).toEqual([]);
    });

    it("removes a disallowed tag and records the reason verbatim", () => {
      const { html, removed } = sanitizer.sanitize(
        "<script>alert(1)</script><p>ok</p>",
        FULL,
      );
      expect(html).not.toContain("<script");
      expect(html).not.toContain("alert(1)");
      expect(html).toContain("<p>ok</p>");
      expect(removed).toContainEqual({
        tag: "script",
        reason: "disallowed tag",
      });
    });

    it("drops media tags when allowMedia is false", () => {
      const { html, removed } = sanitizer.sanitize(
        '<p>x</p><img src="/media/abc" alt="">',
        RESTRICTED,
      );
      expect(html).not.toContain("<img");
      expect(removed).toContainEqual({ tag: "img", reason: "disallowed tag" });
    });
  });

  describe("attribute policy", () => {
    it("strips event-handler attributes", () => {
      const { html, removed } = sanitizer.sanitize(
        '<p onclick="bad()">x</p>',
        FULL,
      );
      expect(html).not.toContain("onclick");
      expect(html).toContain("<p>x</p>");
      // `on*` is not in any allowlist, so it is reported as a disallowed
      // attribute (the dedicated event-handler branch is only reached if
      // the allowlist is ever widened to include an `on*` name).
      expect(removed).toContainEqual({
        tag: "p",
        reason: "disallowed attribute: onclick",
      });
    });

    it("strips disallowed attributes but keeps the tag", () => {
      const { html, removed } = sanitizer.sanitize(
        '<a href="https://x.com" data-evil="1">l</a>',
        FULL,
      );
      expect(html).toContain('href="https://x.com"');
      expect(html).not.toContain("data-evil");
      expect(removed).toContainEqual({
        tag: "a",
        reason: "disallowed attribute: data-evil",
      });
    });

    it("allows id on headings (anchor support)", () => {
      const { html } = sanitizer.sanitize(
        '<h2 id="commerce">特定商取引法</h2>',
        RESTRICTED,
      );
      expect(html).toContain('<h2 id="commerce">');
    });
  });

  describe("URL scheme policy", () => {
    it("removes javascript: hrefs", () => {
      const { html, removed } = sanitizer.sanitize(
        '<a href="javascript:alert(1)">x</a>',
        FULL,
      );
      expect(html).not.toContain("javascript:");
      expect(removed).toContainEqual({
        tag: "a",
        reason: "unsafe URL scheme: href",
      });
    });

    it("removes data: image sources", () => {
      const { html, removed } = sanitizer.sanitize(
        '<img src="data:image/png;base64,iVB" alt="">',
        FULL,
      );
      expect(html).not.toContain("data:image/png");
      expect(removed).toContainEqual({
        tag: "img",
        reason: "unsafe URL scheme: src",
      });
    });

    it("keeps http/https/mailto and relative URLs", () => {
      const { html } = sanitizer.sanitize(
        '<p><a href="https://x.com">a</a><a href="mailto:a@b.c">b</a><a href="/rel">c</a></p>',
        FULL,
      );
      expect(html).toContain('href="https://x.com"');
      expect(html).toContain('href="mailto:a@b.c"');
      expect(html).toContain('href="/rel"');
    });

    it("removes protocol-relative href (//host resolves to an external host)", () => {
      const { html, removed } = sanitizer.sanitize(
        '<a href="//evil.com/x">x</a>',
        FULL,
      );
      expect(html).not.toContain("evil.com");
      expect(removed).toContainEqual({
        tag: "a",
        reason: "unsafe URL scheme: href",
      });
    });

    it("removes protocol-relative img src", () => {
      const { html, removed } = sanitizer.sanitize(
        '<img src="//evil.com/x" alt="">',
        FULL,
      );
      expect(html).not.toContain("evil.com");
      expect(removed).toContainEqual({
        tag: "img",
        reason: "unsafe URL scheme: src",
      });
    });

    it("removes backslash variants browsers normalise to //", () => {
      for (const href of ["/\\evil.com", "\\/evil.com", "\\\\evil.com"]) {
        const { html, removed } = sanitizer.sanitize(
          `<a href="${href}">x</a>`,
          FULL,
        );
        expect(html).not.toContain("evil.com");
        expect(removed).toContainEqual({
          tag: "a",
          reason: "unsafe URL scheme: href",
        });
      }
    });
  });

  describe("attribute-value breakout (renderSync does not escape)", () => {
    const hasHandlerAttr = (html: ContentHtmlType): boolean =>
      liveAttrNames(html).some((n) => n.startsWith("on"));

    it("escapes a raw quote in an attribute value so it cannot inject a handler", () => {
      const { html } = sanitizer.sanitize(
        `<img src="/media/x" alt='x"onerror="alert(1)'>`,
        FULL,
      );
      expect(hasHandlerAttr(html)).toBe(false);
      expect(html).toContain("&quot;");
    });

    it("neutralises a single-quoted src breakout", () => {
      const { html } = sanitizer.sanitize(
        `<img src='/x" onerror="alert(1)'>`,
        FULL,
      );
      expect(hasHandlerAttr(html)).toBe(false);
    });

    it("neutralises a class-attribute breakout on a block element", () => {
      const { html } = sanitizer.sanitize(
        `<div class='a"onmouseover="alert(1)'>t</div>`,
        FULL,
      );
      expect(hasHandlerAttr(html)).toBe(false);
    });

    it("does not double-encode existing entities in attributes or text", () => {
      const { html } = sanitizer.sanitize(
        '<a href="https://x.com" title="he &quot;said&quot;">Tom &amp; Jerry</a>',
        FULL,
      );
      expect(html).toContain('title="he &quot;said&quot;"');
      expect(html).toContain("Tom &amp; Jerry");
      expect(html).not.toContain("&amp;quot;");
      expect(html).not.toContain("&amp;amp;");
    });
  });

  describe("media id extraction contract", () => {
    it("emits <img> output that NoteService.mediaPattern can match", () => {
      const mediaId = "01h0000000000000000000abcd";
      const { html } = sanitizer.sanitize(
        `<p><img src="/media/${mediaId}" alt=""></p>`,
        FULL,
      );
      const mediaPattern =
        /<(?:img|video|source)[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
      const match = mediaPattern.exec(html as string);
      expect(match?.[1]).toBe(`/media/${mediaId}`);
    });
  });

  describe("[[wikilink]] passthrough", () => {
    it("leaves internal-link placeholders untouched", () => {
      const { html } = sanitizer.sanitize(
        "<p>see [[target]] and [[id|display]]</p>",
        FULL,
      );
      expect(html).toContain("[[target]]");
      expect(html).toContain("[[id|display]]");
    });
  });

  describe("toPlainText", () => {
    it("strips tags, decodes entities and collapses whitespace", () => {
      const html = ContentHtml.create(
        "<h2>Title</h2>\n<p>a&amp;b   c &#39;d&#39;</p>",
      );
      expect(sanitizer.toPlainText(html)).toBe("Title a&b c 'd'");
    });

    it("round-trips a sanitised body", () => {
      const { html } = sanitizer.sanitize(
        "<p>Hello <strong>world</strong></p>",
        FULL,
      );
      expect(sanitizer.toPlainText(html)).toBe("Hello world");
    });
  });
});
