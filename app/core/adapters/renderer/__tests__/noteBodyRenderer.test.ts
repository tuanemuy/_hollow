import { defaultParseSearch } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import {
  ContentHtml,
  InternalLinkRef,
  NoteId,
} from "@/core/domain/note/valueObject";
import { UltrahtmlNoteBodyRenderer } from "../noteBodyRenderer";

const renderer = new UltrahtmlNoteBodyRenderer();

// A valid UUIDv7 used as a resolved internal-link target / note id.
const NOTE_ID = "0193e7d7-0001-7000-8000-000000000001";
const NOTE_ID_2 = "0193e7d7-0002-7000-8000-000000000002";
const noteId = (id: string): NoteId => NoteId.create(id);

const render = (
  html: string,
  refs = [] as Parameters<typeof renderer.renderForDisplay>[1],
  options?: Parameters<typeof renderer.renderForDisplay>[2],
) => renderer.renderForDisplay(ContentHtml.create(html), refs, options);

// Pull the `href` value out of an emitted `<a ... href="...">`.
const hrefOf = (html: string): string => {
  const m = html.match(/href="([^"]*)"/);
  if (m === null || m[1] === undefined) {
    throw new Error(`no href in: ${html}`);
  }
  return m[1];
};

describe("UltrahtmlNoteBodyRenderer", () => {
  describe("wikilink markup", () => {
    it('renders an id-keyed resolved [[id|display]] as a linking <a class="wikilink">', () => {
      const ref = InternalLinkRef.create({
        kind: "id",
        target: NOTE_ID,
        resolvedNoteId: noteId(NOTE_ID),
        displayText: "表示",
      });
      const out = render(`<p>関連: [[${NOTE_ID}|表示]] を参照</p>`, [ref]);
      expect(out).toContain(
        `<a class="wikilink" href="/notes/${NOTE_ID}">表示</a>`,
      );
    });

    it("uses the target as the label when no display segment is given", () => {
      const ref = InternalLinkRef.create({
        kind: "title",
        target: "静かなインターフェース",
        resolvedNoteId: noteId(NOTE_ID),
        displayText: null,
      });
      const out = render("<p>[[静かなインターフェース]]</p>", [ref]);
      expect(out).toContain(
        `<a class="wikilink" href="/notes/${NOTE_ID}">静かなインターフェース</a>`,
      );
    });

    it('renders an unresolved [[title]] as a non-linking <span class="wikilink" data-unresolved>', () => {
      const out = render("<p>[[未解決ノート]]</p>", []);
      expect(out).toContain(
        '<span class="wikilink" data-unresolved>未解決ノート</span>',
      );
      expect(out).not.toContain('<a class="wikilink"');
    });

    it("falls back to ref.displayText when [[id]] has no inline display segment", () => {
      const ref = InternalLinkRef.create({
        kind: "id",
        target: NOTE_ID,
        resolvedNoteId: noteId(NOTE_ID),
        displayText: "保存された表示名",
      });
      const out = render(`<p>[[${NOTE_ID}]]</p>`, [ref]);
      expect(out).toContain(
        `<a class="wikilink" href="/notes/${NOTE_ID}">保存された表示名</a>`,
      );
      // The raw UUID must not leak into the visible label.
      expect(out).not.toContain(`>${NOTE_ID}</a>`);
    });

    it("renders a title-keyed ref whose resolvedNoteId is null as unresolved", () => {
      const ref = InternalLinkRef.create({
        kind: "title",
        target: "未解決ノート",
        resolvedNoteId: null,
        displayText: null,
      });
      const out = render("<p>[[未解決ノート]]</p>", [ref]);
      expect(out).toContain(
        '<span class="wikilink" data-unresolved>未解決ノート</span>',
      );
    });

    it("matches refs by (kind, target) so the right resolvedNoteId is chosen", () => {
      const refs = [
        InternalLinkRef.create({
          kind: "title",
          target: "A",
          resolvedNoteId: noteId(NOTE_ID),
          displayText: null,
        }),
        InternalLinkRef.create({
          kind: "title",
          target: "B",
          resolvedNoteId: noteId(NOTE_ID_2),
          displayText: null,
        }),
      ];
      const out = render("<p>[[A]] と [[B]]</p>", refs);
      expect(out).toContain(`href="/notes/${NOTE_ID}">A</a>`);
      expect(out).toContain(`href="/notes/${NOTE_ID_2}">B</a>`);
    });
  });

  describe("hashtag markup (auth surface, default)", () => {
    it('renders #tag as a linking <a class="hashtag" href="/?tagNames=...">', () => {
      const out = render("<p>タグ: #design #essay</p>");
      expect(out).toContain('<a class="hashtag" href="/?tagNames=');
      expect(out).toContain(">#design</a>");
      expect(out).toContain(">#essay</a>");
    });

    it("emits a tagNames href that round-trips to { tagNames: [tag] } via TanStack's default parser", () => {
      // The whole point of P-001: a scalar `?tagNames=foo` would parse to the
      // string "foo", be rejected by the array schema, and silently drop. The
      // round-trip through `defaultParseSearch` proves the emitted form is the
      // JSON-array form the home filter actually accepts.
      const out = render("<p>#design</p>");
      const href = hrefOf(out);
      const query = href.slice(href.indexOf("?"));
      expect(defaultParseSearch(query)).toEqual({ tagNames: ["design"] });
    });

    it("explicit surface:auth keeps hashtags linking", () => {
      const out = render("<p>#essay</p>", [], { surface: "auth" });
      const href = hrefOf(out);
      const query = href.slice(href.indexOf("?"));
      expect(defaultParseSearch(query)).toEqual({ tagNames: ["essay"] });
    });

    it("JSON-array-encodes and attribute-escapes an XSS-payload tag and still round-trips", () => {
      // HASHTAG_PATTERN excludes <>"'` and whitespace, but a tag may still
      // carry characters that need escaping inside JSON / the href attribute.
      // `&` survives in the JSON array, so the href must keep the round-trip
      // value intact while never breaking out of the attribute.
      const tag = "a&b";
      const out = render(`<p>#${tag}</p>`);
      const href = hrefOf(out);
      // No raw double-quote leaked into the attribute (would break out).
      expect(href).not.toContain('"');
      const query = href.slice(href.indexOf("?"));
      expect(defaultParseSearch(query)).toEqual({ tagNames: [tag] });
      // No live markup injected from the tag.
      expect(out).not.toContain("<script");
    });
  });

  describe("hashtag markup (public surface)", () => {
    it('renders #tag as a non-linking <span class="hashtag">', () => {
      const out = render("<p>タグ: #design #essay</p>", [], {
        surface: "public",
      });
      expect(out).toContain('<span class="hashtag">#design</span>');
      expect(out).toContain('<span class="hashtag">#essay</span>');
      expect(out).not.toContain('<a class="hashtag"');
    });
  });

  describe("wikilink surface routing", () => {
    const ref = InternalLinkRef.create({
      kind: "id",
      target: NOTE_ID,
      resolvedNoteId: noteId(NOTE_ID),
      displayText: "表示",
    });

    it("public surface points a resolved wikilink at /notes/public/$id", () => {
      const out = render(`<p>[[${NOTE_ID}|表示]]</p>`, [ref], {
        surface: "public",
      });
      expect(out).toContain(
        `<a class="wikilink" href="/notes/public/${NOTE_ID}">表示</a>`,
      );
      expect(out).not.toContain(`href="/notes/${NOTE_ID}"`);
    });

    it("auth surface (default) keeps a resolved wikilink at /notes/$id", () => {
      const out = render(`<p>[[${NOTE_ID}|表示]]</p>`, [ref]);
      expect(out).toContain(
        `<a class="wikilink" href="/notes/${NOTE_ID}">表示</a>`,
      );
      expect(out).not.toContain("/notes/public/");
    });

    it("public surface leaves an unresolved wikilink as a non-linking span", () => {
      const out = render("<p>[[未解決ノート]]</p>", [], {
        surface: "public",
      });
      expect(out).toContain(
        '<span class="wikilink" data-unresolved>未解決ノート</span>',
      );
      expect(out).not.toContain('<a class="wikilink"');
    });
  });

  describe("wikilink / hashtag overlap (Test N-001)", () => {
    it("drops a #tag that falls inside a [[...]] span (wikilink wins)", () => {
      // `[[a #b c]]` parses as a single title-keyed wikilink whose target is
      // `a #b c`. The `#b` lies inside the claimed wikilink range, so
      // `collectReplacements` discards the hashtag rather than nesting markup.
      const out = render("<p>[[a #b c]]</p>");
      // The whole token becomes one wikilink span; `#b` is part of its label,
      // not a separate hashtag element.
      expect(out).toContain(
        '<span class="wikilink" data-unresolved>a #b c</span>',
      );
      expect(out).not.toContain('class="hashtag"');
    });

    it("still marks up a #tag that sits outside the [[...]] span", () => {
      // The trailing `#after` is past the wikilink's end, so it survives.
      // Asserted on the public surface so the pill stays a stable <span>;
      // the overlap mechanic is surface-independent.
      const out = render("<p>[[a #b]] #after</p>", [], { surface: "public" });
      expect(out).toContain(
        '<span class="wikilink" data-unresolved>a #b</span>',
      );
      expect(out).toContain('<span class="hashtag">#after</span>');
    });
  });

  describe("scope restrictions", () => {
    it("does not transform tokens inside <pre>/<code>", () => {
      const out = render(
        "<pre><code>#include &lt;stdio.h&gt; [[notlink]]</code></pre>",
      );
      expect(out).not.toContain('class="hashtag"');
      expect(out).not.toContain('class="wikilink"');
      expect(out).toContain("#include");
      expect(out).toContain("[[notlink]]");
    });

    it("does not transform tokens inside an existing <a>", () => {
      const out = render('<p><a href="/x">see #design and [[note]]</a></p>');
      expect(out).not.toContain('class="hashtag"');
      expect(out).not.toContain('class="wikilink"');
      expect(out).toContain('<a href="/x">');
    });

    it("does not touch tokens that appear inside attribute values", () => {
      const out = render('<p title="#notatag">body #real</p>', [], {
        surface: "public",
      });
      // The title attribute keeps its literal value...
      expect(out).toContain('title="#notatag"');
      // ...while the body text token is marked up.
      expect(out).toContain('<span class="hashtag">#real</span>');
    });

    it("leaves plain markup without tokens untouched", () => {
      const out = render("<p>just <strong>bold</strong> text</p>");
      expect(out).toBe("<p>just <strong>bold</strong> text</p>");
    });
  });

  describe("XSS escaping", () => {
    it("escapes literal angle brackets in a display label that the markup emits", () => {
      // A bare `<` not forming a tag survives ultrahtml parsing as text, so
      // a display containing one reaches the emitted markup. The renderer
      // escapes `<`/`>` defensively rather than re-emitting them live.
      const ref = InternalLinkRef.create({
        kind: "title",
        target: "T",
        resolvedNoteId: noteId(NOTE_ID),
        displayText: "a < script > b",
      });
      const out = render("<p>[[T|a < script > b]]</p>", [ref]);
      expect(out).toContain(`<a class="wikilink" href="/notes/${NOTE_ID}">`);
      expect(out).toContain("a &lt; script &gt; b");
      // No stray live element was produced from the bracketed display.
      expect(out).not.toContain("<script");
    });

    it("never re-emits a live <img> from bracketed body text", () => {
      // Already-escaped entities in sanitized input stay literal — the
      // renderer must not decode them back into live markup.
      const out = render("<p>text &lt;img src=x&gt; #real</p>", [], {
        surface: "public",
      });
      expect(out).not.toContain("<img");
      expect(out).toContain('<span class="hashtag">#real</span>');
    });

    it("terminates a hashtag token at a literal '<' (HASHTAG_PATTERN excludes <>\"'`)", () => {
      // HASHTAG_PATTERN is /#([^\s#<>"'`]+)/g, so `<`/`>`/`"`/`'`/`` ` `` end
      // the token. A bare `<` not forming a tag survives ultrahtml parsing as
      // text (see the bracketed-display XSS case above), so `#a<b` reaches the
      // tokenizer as the text `#a<b` and matches only `#a`. The trailing `<b`
      // stays outside the hashtag span. This demonstrates the termination the
      // previous `#tag`-only assertion merely claimed in a comment.
      const out = render("<p>#a<b</p>", [], { surface: "public" });
      expect(out).toContain('<span class="hashtag">#a</span><b');
      expect(out).not.toContain('class="hashtag">#a<b');
    });

    it("emits a plain #tag verbatim inside its span (public surface)", () => {
      const out = render("<p>#tag</p>", [], { surface: "public" });
      expect(out).toBe('<p><span class="hashtag">#tag</span></p>');
    });
  });
});
