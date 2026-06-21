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

  it("formats root-level block siblings that include a <pre> (W-003)", () => {
    // `<pre>` counts as a block sibling for container formatting, so the
    // surrounding `<p>`s are still indented/line-broken (not suppressed),
    // while the <pre> subtree stays verbatim on its own line.
    const html = "<p>x</p><pre><code>c</code></pre><p>y</p>";
    const formatted = formatHtml(html);
    expect(formatted).toBe("<p>x</p>\n<pre><code>c</code></pre>\n<p>y</p>");
    // Confirm formatting actually fired (no-op degradation guard).
    expect(formatted).not.toBe(html);
    expect(formatted).toContain("\n");
    expect(minifyHtml(formatted)).toBe(html);
  });

  it("formats a <pre> note that already carries inter-block \\n (W-002-001)", () => {
    // The real persisted shape for a code-block note: markdown-it →
    // sanitiser emits inter-block `\n` around the `<pre>` (the renderSync
    // output is byte-equal to this). The surrounding `<p>`s must stay
    // formatted while the `<pre>` subtree is verbatim — a no-op regression
    // (formatter degenerating to identity on the whole container) would be
    // caught by the explicit expected value here.
    const persisted =
      "<p>before</p>\n<pre><code>x = 1\n</code></pre>\n<p>after</p>";
    const formatted = formatHtml(persisted);
    expect(formatted).toBe(
      "<p>before</p>\n<pre><code>x = 1\n</code></pre>\n<p>after</p>",
    );
    expect(formatted).toContain("<pre><code>x = 1\n</code></pre>");
    // `formatHtml` is idempotent on this shape — the invariant the B-001
    // pristine check (`htmlDraft === formatHtml(contentHtml)`) relies on.
    expect(formatHtml(formatted)).toBe(formatted);
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

describe("deep nesting is actually indented, not no-op'd (W-002)", () => {
  it("indents a 5-level table (thead/tbody/tr/th/td)", () => {
    // Pin the exact multi-level indentation so the depth calculation is
    // fixed: if format ever degenerates to a no-op the literal below stops
    // matching. (roundtrip alone would pass on a no-op formatter.)
    const m =
      "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>";
    expect(formatHtml(m)).toBe(
      [
        "<table>",
        "  <thead>",
        "    <tr>",
        "      <th>h</th>",
        "    </tr>",
        "  </thead>",
        "  <tbody>",
        "    <tr>",
        "      <td>d</td>",
        "    </tr>",
        "  </tbody>",
        "</table>",
      ].join("\n"),
    );
    expect(minifyHtml(formatHtml(m))).toBe(m);
  });

  it("indents a nested blockquote", () => {
    const m = "<blockquote><p>a</p><p>b</p></blockquote>";
    expect(formatHtml(m)).toBe(
      ["<blockquote>", "  <p>a</p>", "  <p>b</p>", "</blockquote>"].join("\n"),
    );
    expect(minifyHtml(formatHtml(m))).toBe(m);
  });
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

  it("keeps inline <code> and its word-gap spaces verbatim (AC-4)", () => {
    // `<code>` is inline + whitespace-significant: its container stays
    // verbatim so the inter-word spaces and the code text are untouched.
    const m = "<p>x <code>y</code> z</p>";
    expect(formatHtml(m)).toBe(m);
    expect(minifyHtml(formatHtml(m))).toBe(m);
  });
});

describe("renderSync-derived contentHtml still formats (W-001/W-002)", () => {
  it("indents/line-breaks markdown-derived block siblings", () => {
    // Mirrors the actual persisted `contentHtml`: markdown-it emits
    // inter-block `\n` and the sanitiser's `renderSync` preserves it.
    // Formatting must not degrade to a no-op for this real-world shape.
    const persisted = "<h2>a</h2>\n<p>b</p>\n<ul>\n<li>x</li>\n</ul>\n";
    const formatted = formatHtml(persisted);
    expect(formatted).toBe("<h2>a</h2>\n<p>b</p>\n<ul>\n  <li>x</li>\n</ul>");
    // The formatter genuinely restructured the input (indented the <li>).
    expect(formatted).not.toBe(persisted);
    expect(formatted).toContain("\n  <li>");
  });
});

describe("figure with a void <img> child stays verbatim (intended, W-001)", () => {
  it("formats a figure+img as a no-op and roundtrips identically", () => {
    // Intended spec: a void child (img) is context-dependent (inside a `<p>`
    // it is inline and must keep inter-word spaces), so figure is not
    // block-promoted and is emitted verbatim — round-trip safety and inline
    // whitespace preservation are prioritised over maximal pretty-printing
    // (AC-5). This pins the current no-op so the choice can't silently flip.
    const fig =
      '<figure><img src="/media/1" alt=""><figcaption>cap</figcaption></figure>';
    expect(formatHtml(fig)).toBe(fig);
    expect(minifyHtml(formatHtml(fig))).toBe(fig);
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

  it("returns input verbatim when parse throws (catch fallback)", () => {
    // A stray close tag makes `ultrahtml.parse` throw; the try/catch
    // fallback must return the input byte-for-byte so a half-typed
    // fragment is never lost (AC-8, the real catch path).
    const broken = "</div>";
    expect(() => formatHtml(broken)).not.toThrow();
    expect(() => minifyHtml(broken)).not.toThrow();
    expect(formatHtml(broken)).toBe(broken);
    expect(minifyHtml(broken)).toBe(broken);
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
