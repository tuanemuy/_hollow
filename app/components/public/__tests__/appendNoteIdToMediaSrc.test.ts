import { describe, expect, it } from "vitest";
import { appendNoteIdToMediaSrc } from "../appendNoteIdToMediaSrc";

describe("appendNoteIdToMediaSrc", () => {
  it("appends ?noteId to an <img> src pointing at /media/<id>", () => {
    const html = `<p><img src="/media/abc-123" alt="" /></p>`;
    expect(appendNoteIdToMediaSrc(html, "note-1")).toBe(
      `<p><img src="/media/abc-123?noteId=note-1" alt="" /></p>`,
    );
  });

  it("rewrites multiple media occurrences in one pass", () => {
    const html =
      `<img src="/media/a" /><video src="/media/b"></video>` +
      `<source src="/media/c"/>`;
    expect(appendNoteIdToMediaSrc(html, "n")).toBe(
      `<img src="/media/a?noteId=n" /><video src="/media/b?noteId=n"></video>` +
        `<source src="/media/c?noteId=n"/>`,
    );
  });

  it("supports single-quoted src attributes", () => {
    const html = `<img src='/media/abc' />`;
    expect(appendNoteIdToMediaSrc(html, "n1")).toBe(
      `<img src='/media/abc?noteId=n1' />`,
    );
  });

  it("URL-encodes noteId values that need escaping", () => {
    const html = `<img src="/media/abc" />`;
    expect(appendNoteIdToMediaSrc(html, "id with space")).toBe(
      `<img src="/media/abc?noteId=id%20with%20space" />`,
    );
  });

  it("leaves srcs that already carry a query untouched", () => {
    const html = `<img src="/media/abc?noteId=other" />`;
    expect(appendNoteIdToMediaSrc(html, "n")).toBe(html);
  });

  it("ignores non-/media/ srcs (external URLs, data URIs)", () => {
    const html =
      `<img src="https://example.com/x.png" />` +
      `<img src="data:image/png;base64,AAA" />` +
      `<img src="/other/abc" />`;
    expect(appendNoteIdToMediaSrc(html, "n")).toBe(html);
  });

  it("returns input unchanged when noteId is empty", () => {
    const html = `<img src="/media/abc" />`;
    expect(appendNoteIdToMediaSrc(html, "")).toBe(html);
  });

  it("returns input unchanged when html is empty", () => {
    expect(appendNoteIdToMediaSrc("", "n")).toBe("");
  });

  it("does not touch <a href='/media/...'> (only media tag srcs)", () => {
    const html = `<a href="/media/abc">link</a>`;
    expect(appendNoteIdToMediaSrc(html, "n")).toBe(html);
  });
});
