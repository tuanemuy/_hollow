// @vitest-environment happy-dom

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { UltrahtmlHtmlSanitizer } from "@/core/adapters/sanitizer/htmlSanitizer";
import { MEDIA_ID_FROM_URL } from "@/core/domain/note/service";

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
 *    URL intact across both serialisation hops (TipTap → HTML, then HTML
 *    → sanitiser), so the server-side `MEDIA_ID_FROM_URL` regex still
 *    extracts the asset id for `MediaService.reconcileRefs`.
 *
 * 3. Defence-in-depth: dangerous URL schemes that slip in via TipTap
 *    must be removed by the sanitiser before they hit storage.
 */

const ALLOWED_LINK_SCHEMES = new Set(["http", "https", "mailto"]);
const editorIsAllowedUri = (url: string): boolean => {
  if (url.startsWith("/") || url.startsWith("#") || url.startsWith("?")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return ALLOWED_LINK_SCHEMES.has(parsed.protocol.replace(/:$/, ""));
  } catch {
    return false;
  }
};

const extensions = () => [
  StarterKit.configure({ link: false }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: "noopener noreferrer" },
    isAllowedUri: (url) => editorIsAllowedUri(url),
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
      const sanitizer = new UltrahtmlHtmlSanitizer();
      const result = sanitizer.sanitize(emitted, POLICY);

      // No editor-emitted tag should be reported as a `disallowed tag`.
      // We deliberately do not look at `disallowed attribute` removals
      // because TipTap output may carry attrs the sanitiser drops; the
      // structural tag itself is what must survive.
      const droppedTags = result.removed.filter(
        (r) => r.reason === "disallowed tag",
      );
      expect(droppedTags).toEqual([]);

      // Structural smoke: each tag we care about must still be present
      // in the sanitised HTML.
      for (const tag of [
        "h2",
        "p",
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
      ]) {
        expect(result.html).toMatch(new RegExp(`<${tag}[\\s/>]`));
      }
    } finally {
      editor.destroy();
    }
  });

  it("setImage preserves the `/media/<id>` URL across TipTap and the sanitiser", () => {
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

      // Hop 1: the editor-emitted regex used at the service boundary must
      // still extract the canonical id.
      const direct = MEDIA_ID_FROM_URL.exec(html);
      expect(direct?.[1]).toBe(mediaId);
      MEDIA_ID_FROM_URL.lastIndex = 0;

      // Hop 2: after sanitisation (which is what actually lands in the
      // database), the same regex must still extract the id. Together
      // these two assertions prove the end-to-end ADR-009 contract.
      const sanitizer = new UltrahtmlHtmlSanitizer();
      const sanitised = sanitizer.sanitize(html, POLICY).html;
      const afterSanitise = MEDIA_ID_FROM_URL.exec(sanitised);
      expect(afterSanitise?.[1]).toBe(mediaId);
      MEDIA_ID_FROM_URL.lastIndex = 0;
    } finally {
      editor.destroy();
    }
  });

  it("empty content parses and sanitises without throwing", () => {
    const editor = buildEditor("");
    try {
      const html = editor.getHTML();
      const sanitizer = new UltrahtmlHtmlSanitizer();
      const result = sanitizer.sanitize(html, POLICY);
      // The sanitiser is allowed to normalise empty bodies (e.g. to
      // `<p></p>` or even ""); what matters is that nothing throws and
      // no structural tag is reported as removed.
      expect(
        result.removed.filter((r) => r.reason === "disallowed tag"),
      ).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("javascript: link payloads are stripped before storage", () => {
    // The editor refuses to render the link mark for `javascript:` URLs
    // (Link `isAllowedUri`), but the sanitiser is the actual gatekeeper
    // — assert that any link with a disallowed scheme that does slip
    // through the editor is removed at the boundary.
    const sanitizer = new UltrahtmlHtmlSanitizer();
    const result = sanitizer.sanitize(
      '<p><a href="javascript:alert(1)">x</a></p>',
      POLICY,
    );
    expect(result.html).not.toContain("javascript:");
  });

  it("base64 image payloads do not survive the sanitiser path", () => {
    // `Image.configure({ allowBase64: false })` already refuses to emit
    // the node, but we double-check the sanitiser strips the attribute
    // if a raw `data:` `<img>` is fed in from elsewhere.
    const sanitizer = new UltrahtmlHtmlSanitizer();
    const result = sanitizer.sanitize(
      '<img src="data:image/png;base64,iVBORw0K" alt="">',
      POLICY,
    );
    expect(result.html).not.toContain("data:image/png");
  });
});
