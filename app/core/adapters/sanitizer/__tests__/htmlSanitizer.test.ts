import { describe, expect, it } from "vitest";
import { ContentHtml } from "@/core/domain/note/valueObject";
import { UltrahtmlHtmlSanitizer } from "../htmlSanitizer";

const sanitizer = new UltrahtmlHtmlSanitizer();
const FULL = { allowMedia: true, allowInternalLinks: true } as const;
const RESTRICTED = { allowMedia: false, allowInternalLinks: false } as const;

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
      expect(removed.some((r) => r.tag === "p")).toBe(true);
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
      const { html } = sanitizer.sanitize(
        '<img src="data:image/png;base64,iVB" alt="">',
        FULL,
      );
      expect(html).not.toContain("data:image/png");
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
