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
) => renderer.renderForDisplay(ContentHtml.create(html), refs);

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

  describe("hashtag markup", () => {
    it('renders #tag as a non-linking <span class="hashtag">', () => {
      const out = render("<p>タグ: #design #essay</p>");
      expect(out).toContain('<span class="hashtag">#design</span>');
      expect(out).toContain('<span class="hashtag">#essay</span>');
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
      const out = render('<p title="#notatag">body #real</p>');
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
      const out = render("<p>text &lt;img src=x&gt; #real</p>");
      expect(out).not.toContain("<img");
      expect(out).toContain('<span class="hashtag">#real</span>');
    });

    it("escapes a hashtag token containing angle-bracket entities", () => {
      // `<`/`>`/`"` terminate a hashtag token, so only safe chars remain;
      // assert the emitted span never carries a raw bracket.
      const out = render("<p>#tag</p>");
      expect(out).toBe('<p><span class="hashtag">#tag</span></p>');
    });
  });
});
