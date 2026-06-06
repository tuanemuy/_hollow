import { describe, expect, it } from "vitest";
import { MarkdownItMarkdownConverter } from "../markdownConverter";

const converter = new MarkdownItMarkdownConverter();

describe("MarkdownItMarkdownConverter", () => {
  describe("{#id} heading anchors", () => {
    it("emits an id attribute for a valid `{#id}`", async () => {
      const html = await converter.toHtml("## 特定商取引法 {#commerce}");
      expect(html).toContain('<h2 id="commerce">');
      expect(html).toContain("特定商取引法");
    });

    it("leaves headings without `{#id}` free of an id", async () => {
      const html = await converter.toHtml("## サービス概要");
      expect(html).toContain("<h2>サービス概要</h2>");
      expect(html).not.toContain("id=");
    });

    it("drops an id that does not start with a letter", async () => {
      const html = await converter.toHtml("## bad {#1bad}");
      expect(html).not.toContain('id="1bad"');
      expect(html).not.toContain("id=");
      expect(html).toContain("bad");
    });

    it("drops an id containing disallowed characters", async () => {
      // `{#a:b}` is parsed as an id by markdown-it-attrs but rejected by
      // the SAFE_ID guard, so no id attribute survives.
      const html = await converter.toHtml("## bad {#a:b}");
      expect(html).not.toContain("id=");
      expect(html).toContain("<h2>bad</h2>");
    });

    it("keeps ids with letters, digits, underscores and hyphens", async () => {
      const html = await converter.toHtml("## ok {#section-1_a}");
      expect(html).toContain('id="section-1_a"');
    });
  });

  describe("CommonMark constructs", () => {
    it("renders ATX headings", async () => {
      expect(await converter.toHtml("# h1")).toContain("<h1>h1</h1>");
      expect(await converter.toHtml("###### h6")).toContain("<h6>h6</h6>");
    });

    it("renders unordered and ordered lists", async () => {
      expect(await converter.toHtml("- a\n- b")).toContain("<ul>");
      expect(await converter.toHtml("1. a\n2. b")).toContain("<ol>");
    });

    it("renders blockquotes and horizontal rules", async () => {
      expect(await converter.toHtml("> quoted")).toContain("<blockquote>");
      expect(await converter.toHtml("---")).toContain("<hr>");
    });

    it("renders inline emphasis, strong and code", async () => {
      const html = await converter.toHtml("**b** *i* `c`");
      expect(html).toContain("<strong>b</strong>");
      expect(html).toContain("<em>i</em>");
      expect(html).toContain("<code>c</code>");
    });

    it("renders links", async () => {
      const html = await converter.toHtml("[label](https://example.com)");
      expect(html).toContain('<a href="https://example.com">label</a>');
    });

    it("keeps the `language-xxx` class on fenced code (CodeHighlight contract)", async () => {
      const html = await converter.toHtml("```js\nconst x = 1;\n```");
      expect(html).toContain('<code class="language-js">');
    });
  });

  describe("raw HTML is escaped (html: false)", () => {
    it("does not pass through a raw <script> tag", async () => {
      const html = await converter.toHtml("<script>alert(1)</script>");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("[[wikilink]] verbatim preservation", () => {
    it("keeps `[[target]]` as literal text for link extraction", async () => {
      const html = await converter.toHtml("see [[target]] here");
      expect(html).toContain("[[target]]");
    });

    it("keeps `[[id|display]]` including the pipe verbatim", async () => {
      const html = await converter.toHtml("[[abc|Display Text]]");
      expect(html).toContain("[[abc|Display Text]]");
    });
  });
});
