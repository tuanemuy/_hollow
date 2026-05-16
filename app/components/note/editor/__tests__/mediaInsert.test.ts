import { describe, expect, it } from "vitest";
import { insertMediaIntoHtml } from "../mediaInsert";

describe("insertMediaIntoHtml", () => {
  it("appends an `<img>` with the canonical `/media/<id>` src", () => {
    const out = insertMediaIntoHtml("<p>hi</p>", { id: "abc-123" });
    expect(out).toBe(`<p>hi</p>\n<p><img src="/media/abc-123" alt="" /></p>`);
  });

  it("returns the inserted tag alone when the source is blank", () => {
    expect(insertMediaIntoHtml("", { id: "abc" })).toBe(
      `<p><img src="/media/abc" alt="" /></p>`,
    );
  });

  it("escapes the alt attribute", () => {
    const out = insertMediaIntoHtml("", {
      id: "abc",
      alt: `He said "hi" & <ok>`,
    });
    expect(out).toContain(`alt="He said &quot;hi&quot; &amp; &lt;ok&gt;"`);
  });

  it("rejects ids with attribute-breaking characters", () => {
    expect(() =>
      insertMediaIntoHtml("", { id: `abc" onerror="x` }),
    ).toThrowError(/Invalid media id/);
  });

  it("rejects empty / whitespace ids", () => {
    expect(() => insertMediaIntoHtml("", { id: "" })).toThrowError();
    expect(() => insertMediaIntoHtml("", { id: "   " })).toThrowError();
  });

  it("trims trailing whitespace from the source before appending", () => {
    const out = insertMediaIntoHtml("<p>x</p>   \n\n", { id: "y" });
    expect(out).toBe(`<p>x</p>\n<p><img src="/media/y" alt="" /></p>`);
  });
});
