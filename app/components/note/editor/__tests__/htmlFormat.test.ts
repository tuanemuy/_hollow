import { describe, expect, it } from "vitest";
import { formatHtml, minifyHtml } from "../htmlFormat";

describe("formatHtml", () => {
  it("returns empty input unchanged", () => {
    expect(formatHtml("")).toBe("");
  });

  it("indents and line-breaks block siblings", () => {
    expect(formatHtml("<p>a</p><p>b</p>")).toBe("<p>a</p>\n<p>b</p>");
  });

  it("indents nested block containers", () => {
    expect(formatHtml("<ul><li>one</li><li>two</li></ul>")).toBe(
      "<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>",
    );
  });

  it("keeps inline content (and inter-element spaces) on one line", () => {
    const html = "<p>para with <strong>bold</strong> word</p>";
    expect(formatHtml(html)).toBe(html);
  });
});

describe("minifyHtml", () => {
  it("returns empty input unchanged", () => {
    expect(minifyHtml("")).toBe("");
  });

  it("collapses formatting whitespace between block siblings", () => {
    expect(minifyHtml("<p>a</p>\n<p>b</p>")).toBe("<p>a</p><p>b</p>");
  });

  it("collapses indented nested block containers", () => {
    expect(minifyHtml("<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>")).toBe(
      "<ul><li>one</li><li>two</li></ul>",
    );
  });
});

describe("roundtrip: minifyHtml(formatHtml(m)) === m", () => {
  // Fixtures are the *minified* representation the server sanitiser
  // (`renderSync`) emits — i.e. the actual `contentHtml` users edit.
  const fixtures: readonly string[] = [
    "<p>hi</p><p>world</p>",
    "<ul><li>a</li><li>b</li></ul>",
    "<ol><li>1</li><li>2</li><li>3</li></ol>",
    '<p><a href="/x">foo</a> <a href="/y">bar</a></p>',
    "<p>line1<br>line2</p>",
    "<div><p>nested</p></div>",
    "<blockquote><p>q</p></blockquote>",
    "<h1>Title</h1><p>para with <strong>bold</strong> word</p><ul><li>one</li><li>two</li></ul>",
    "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>",
    '<figure><img src="/media/1" alt=""><figcaption>cap</figcaption></figure>',
  ];

  for (const m of fixtures) {
    it(`roundtrips ${m}`, () => {
      expect(minifyHtml(formatHtml(m))).toBe(m);
    });
  }
});

describe("whitespace-significant elements are not reformatted (AC-4)", () => {
  it("leaves <pre>/<code> inner whitespace untouched through format", () => {
    const html = "<pre><code>a\n  b\n</code></pre>";
    expect(formatHtml(html)).toBe(html);
  });

  it("leaves <pre>/<code> inner whitespace untouched through minify", () => {
    const html = "<pre><code>a\n  b\n</code></pre>";
    expect(minifyHtml(html)).toBe(html);
  });

  it("leaves <textarea> inner whitespace untouched", () => {
    const html = "<textarea>  spaced\n  lines\n</textarea>";
    expect(formatHtml(html)).toBe(html);
    expect(minifyHtml(html)).toBe(html);
  });
});

describe("inline inter-element spaces are preserved (AC-5)", () => {
  it("keeps the word-gap space across a format/minify roundtrip", () => {
    const m = '<p><a href="/x">foo</a> <a href="/y">bar</a></p>';
    expect(formatHtml(m)).toBe(m);
    expect(minifyHtml(formatHtml(m))).toBe(m);
  });
});

describe("internal-link placeholders are preserved (AC-6)", () => {
  it("passes [[...]] through format and minify unchanged", () => {
    const m = "<p>see [[target|display]] here</p>";
    expect(formatHtml(m)).toBe(m);
    expect(minifyHtml(formatHtml(m))).toBe(m);
  });
});

describe("malformed HTML never loses input (AC-8)", () => {
  it("does not throw and keeps the content for an unclosed tag", () => {
    const broken = "<p>broken<span>x";
    // ultrahtml auto-closes; the important guarantee is no throw and no
    // content loss — the visible text survives.
    expect(() => formatHtml(broken)).not.toThrow();
    expect(formatHtml(broken)).toContain("broken");
    expect(formatHtml(broken)).toContain("x");
  });
});

describe("media-insert append normalises on minify (Issue #762 coverage)", () => {
  it("collapses the \\n-joined appended <p><img> block", () => {
    // `insertMediaIntoHtml` appends `\n<p><img.../></p>` to the formatted
    // buffer; minify must fold the join newline back out.
    const formatted = '<p>body</p>\n<p><img src="/media/m1" alt="" /></p>';
    expect(minifyHtml(formatted)).toBe(
      '<p>body</p><p><img src="/media/m1" alt=""></p>',
    );
  });
});
