// @vitest-environment happy-dom

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { SanitizeHtmlSanitizer } from "@/core/adapters/sanitizer/htmlSanitizer";

/**
 * Regression coverage for Issue #9 ADR-009 carry-over:
 *
 * 1. The TipTap output HTML (StarterKit + Link + Image marks/nodes) must
 *    survive `HtmlSanitizer.sanitize()` without losing structural nodes
 *    — i.e. the sanitiser's removal log stays free of editor-emitted
 *    tags. This is what guarantees autosave / explicit-save will not
 *    silently drop user edits made in WYSIWYG mode.
 *
 * 2. Calling `setImage({ src: "/media/<id>" })` keeps the `/media/<id>`
 *    URL intact on the round trip through TipTap's schema → HTML
 *    serialiser, so the server-side `MEDIA_ID_FROM_URL` regex still
 *    extracts the asset id for `MediaService.reconcileRefs`.
 */

const extensions = () => [
  StarterKit.configure({ link: false }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: "noopener noreferrer" },
  }),
  Image.configure({ inline: false, allowBase64: false }),
];

function buildEditor(initialHtml: string): Editor {
  return new Editor({
    extensions: extensions(),
    content: initialHtml,
  });
}

const POLICY = { allowMedia: true, allowInternalLinks: true } as const;

describe("WysiwygEditor sanitizer integration", () => {
  it("StarterKit + Link + Image output passes the sanitizer without dropping editor tags", () => {
    const editor = buildEditor(
      [
        "<h2>Heading</h2>",
        "<p><strong>Bold</strong> and <em>italic</em> and <s>strike</s> and <code>code</code>.</p>",
        "<ul><li>one</li><li>two</li></ul>",
        "<ol><li>first</li><li>second</li></ol>",
        "<blockquote><p>quoted</p></blockquote>",
        '<p><a href="https://example.com" rel="noopener noreferrer">link</a></p>',
        '<img src="/media/01h0000000000000000000abcd" alt="">',
      ].join(""),
    );
    try {
      const emitted = editor.getHTML();
      const sanitizer = new SanitizeHtmlSanitizer();
      const result = sanitizer.sanitize(emitted, POLICY);

      const editorTags = [
        "p",
        "h2",
        "strong",
        "em",
        "s",
        "code",
        "ul",
        "ol",
        "li",
        "blockquote",
        "a",
        "img",
      ];
      const droppedEditorTags = result.removed.filter((r) =>
        editorTags.includes(r.tag),
      );
      expect(droppedEditorTags).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("setImage preserves the `/media/<id>` URL through the schema round trip", () => {
    const editor = buildEditor("<p>before</p>");
    try {
      const mediaId = "01h0000000000000000000abcd";
      editor
        .chain()
        .focus()
        .setImage({ src: `/media/${mediaId}`, alt: "" })
        .run();

      const html = editor.getHTML();
      expect(html).toContain(`src="/media/${mediaId}"`);

      const MEDIA_ID_FROM_URL = /\/media\/([0-9a-z-]+)/i;
      const match = MEDIA_ID_FROM_URL.exec(html);
      expect(match?.[1]).toBe(mediaId);
    } finally {
      editor.destroy();
    }
  });
});
