import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { highlightSnippet } from "../highlightSnippet";

/**
 * Verifies the FTS5 snippet highlighter renders `<mark>` markers as styled
 * elements while keeping user-authored text escaped (no HTML injection).
 */
describe("highlightSnippet", () => {
  it("renders <mark> markers as styled mark elements (AC-1)", () => {
    const html = renderToStaticMarkup(
      <>{highlightSnippet("<mark>foo</mark>bar")}</>,
    );

    expect(html).toMatch(/<mark[^>]*class="[^"]+"[^>]*>foo<\/mark>/);
    expect(html).toContain("bar");
  });

  it("escapes user text outside markers (AC-2)", () => {
    const html = renderToStaticMarkup(
      <>
        {highlightSnippet(
          "before<mark>hit</mark> <script>alert(1)</script><b>x</b>",
        )}
      </>,
    );

    // The matched term stays a real <mark> element...
    expect(html).toMatch(/<mark[^>]*>hit<\/mark>/);
    // ...but user text is escaped, never emitted as live elements.
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;");
  });

  it("renders plain snippets without markers unchanged (AC-3)", () => {
    const html = renderToStaticMarkup(
      <>{highlightSnippet("a plain snippet … no markers")}</>,
    );

    expect(html).toContain("a plain snippet … no markers");
    expect(html).not.toContain("<mark");
  });
});
