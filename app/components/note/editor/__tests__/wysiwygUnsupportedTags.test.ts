import { describe, expect, it } from "vitest";
import {
  detectUnsupportedTags,
  WYSIWYG_SUPPORTED_TAGS,
} from "../wysiwygUnsupportedTags";

describe("detectUnsupportedTags", () => {
  it("returns [] for empty input", () => {
    expect(detectUnsupportedTags("")).toEqual([]);
  });

  it("returns [] when only StarterKit-supported tags are present", () => {
    const html =
      "<p>hi</p><h2>title</h2><strong>bold</strong><a href='/x'>x</a><img src='/m/1'/>";
    expect(detectUnsupportedTags(html)).toEqual([]);
  });

  it("detects <table> and its children, sorted alphabetically", () => {
    expect(detectUnsupportedTags("<table><tr><td>x</td></tr></table>")).toEqual(
      ["table", "td", "tr"],
    );
  });

  it("detects <mark>", () => {
    expect(detectUnsupportedTags("<p><mark>m</mark></p>")).toEqual(["mark"]);
  });

  it("detects <kbd>", () => {
    expect(detectUnsupportedTags("<kbd>Cmd</kbd>+<kbd>K</kbd>")).toEqual([
      "kbd",
    ]);
  });

  it("detects <figure>/<figcaption> while letting <img> pass", () => {
    const html =
      "<figure><figcaption>cap</figcaption><img src='/m/1'/></figure>";
    expect(detectUnsupportedTags(html)).toEqual(["figcaption", "figure"]);
  });

  it("detects <section> and <article> (StarterKit cannot model them)", () => {
    expect(
      detectUnsupportedTags("<section><p>x</p></section><article>y</article>"),
    ).toEqual(["article", "section"]);
  });

  it("normalises uppercase tag names to lowercase", () => {
    expect(detectUnsupportedTags("<MARK>m</MARK>")).toEqual(["mark"]);
  });

  it("de-duplicates repeated unsupported tags", () => {
    expect(
      detectUnsupportedTags("<mark>a</mark><mark>b</mark><mark>c</mark>"),
    ).toEqual(["mark"]);
  });

  it("ignores HTML comments", () => {
    expect(
      detectUnsupportedTags("<!-- <mark>masked</mark> --><p>x</p>"),
    ).toEqual([]);
  });

  it("treats <b>/<i>/<u> as supported aliases (no warning)", () => {
    expect(
      detectUnsupportedTags("<b>bold</b><i>italic</i><u>under</u>"),
    ).toEqual([]);
  });

  it("treats <div>/<span> as supported wrappers (no warning)", () => {
    expect(detectUnsupportedTags("<div><span>x</span></div>")).toEqual([]);
  });

  // Sanitizer surface coverage: every tag the server-side sanitiser
  // accepts must be classified deterministically as supported (no
  // warning) or unsupported (warning). This pin prevents the two
  // surfaces from drifting silently.
  it("matches the sanitiser surface — unsupported set", () => {
    const SANITISER_TAGS = [
      // BLOCK_TAGS
      "p",
      "br",
      "hr",
      "blockquote",
      "pre",
      "code",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "div",
      "span",
      "section",
      "article",
      // INLINE_TAGS
      "a",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "s",
      "del",
      "ins",
      "sub",
      "sup",
      "mark",
      "small",
      "kbd",
      "abbr",
      "cite",
      "q",
      // MEDIA_TAGS
      "img",
      "video",
      "audio",
      "source",
      "figure",
      "figcaption",
    ];
    const expectedUnsupported = SANITISER_TAGS.filter(
      (t) => !WYSIWYG_SUPPORTED_TAGS.has(t),
    ).sort();
    const html = SANITISER_TAGS.map((t) => `<${t}></${t}>`).join("");
    expect(detectUnsupportedTags(html)).toEqual(expectedUnsupported);
  });
});

describe("WYSIWYG_SUPPORTED_TAGS", () => {
  it("contains the StarterKit emit set", () => {
    for (const t of [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "strong",
      "em",
      "s",
      "hr",
      "a",
      "img",
    ]) {
      expect(WYSIWYG_SUPPORTED_TAGS.has(t)).toBe(true);
    }
  });

  it("includes alias / wrapper tags TipTap normalises", () => {
    for (const t of ["b", "i", "u", "div", "span"]) {
      expect(WYSIWYG_SUPPORTED_TAGS.has(t)).toBe(true);
    }
  });

  it("excludes section / article", () => {
    expect(WYSIWYG_SUPPORTED_TAGS.has("section")).toBe(false);
    expect(WYSIWYG_SUPPORTED_TAGS.has("article")).toBe(false);
  });
});
