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

  // W-010: `alt` accepts arbitrary user text. Each case below verifies
  // the escaping pipeline collapses risky characters into entities so
  // the attribute boundary cannot be broken from caller data.
  it("alt: omitted collapses to an empty alt attribute", () => {
    // `alt?: string` is exact-optional under the project's tsconfig, so
    // we omit the property entirely. The implementation's `input.alt ?? ""`
    // handles the missing-property case identically to `undefined`.
    const out = insertMediaIntoHtml("", { id: "abc" });
    expect(out).toContain(`alt=""`);
  });

  it("alt: empty string yields an empty alt attribute", () => {
    const out = insertMediaIntoHtml("", { id: "abc", alt: "" });
    expect(out).toContain(`alt=""`);
  });

  it("alt: embedded newline passes through (browsers ignore it in attributes)", () => {
    const out = insertMediaIntoHtml("", { id: "abc", alt: "line1\nline2" });
    // No quoting required for `\n` per HTML5; the sanitizer will keep it.
    expect(out).toContain(`alt="line1\nline2"`);
  });

  it("alt: NUL byte passes through unescaped (raw payload preserved)", () => {
    const out = insertMediaIntoHtml("", { id: "abc", alt: "a\0b" });
    expect(out).toContain(`alt="a\0b"`);
  });

  it("alt: backslash is preserved as-is", () => {
    const out = insertMediaIntoHtml("", { id: "abc", alt: "a\\b" });
    expect(out).toContain(`alt="a\\b"`);
  });

  it("alt: escapes `&`, `<`, `>` and single-quote-friendly characters", () => {
    const out = insertMediaIntoHtml("", {
      id: "abc",
      alt: `&<>'`,
    });
    // `&` first to avoid double-escaping; `'` is safe inside double-quoted
    // attributes so the implementation leaves it untouched.
    expect(out).toContain(`alt="&amp;&lt;&gt;'"`);
  });

  // W-011: media id is interpolated directly into the `src` attribute,
  // so the boundary between valid and rejected ids is security-load-bearing.
  // The cases below pin the current regex (`/^[0-9a-z-]+$/i`).
  describe("id boundary", () => {
    it("accepts a UUIDv7-shaped id", () => {
      const id = "018fadc3-5b9e-7c2a-9b1d-0f3e4a5b6c7d";
      expect(() => insertMediaIntoHtml("", { id })).not.toThrow();
    });

    it("accepts mixed-case ids", () => {
      expect(() => insertMediaIntoHtml("", { id: "AbCdEf-123" })).not.toThrow();
    });

    it("accepts digits-only ids", () => {
      expect(() => insertMediaIntoHtml("", { id: "1234567890" })).not.toThrow();
    });

    it("accepts hyphens-only ids", () => {
      expect(() => insertMediaIntoHtml("", { id: "---" })).not.toThrow();
    });

    it("rejects ids containing `/`", () => {
      expect(() => insertMediaIntoHtml("", { id: "abc/def" })).toThrowError(
        /Invalid media id/,
      );
    });

    it("rejects ids containing `.`", () => {
      expect(() => insertMediaIntoHtml("", { id: "abc.def" })).toThrowError(
        /Invalid media id/,
      );
    });

    it("rejects ids containing whitespace", () => {
      expect(() => insertMediaIntoHtml("", { id: "abc def" })).toThrowError(
        /Invalid media id/,
      );
    });

    it("rejects the empty string id", () => {
      expect(() => insertMediaIntoHtml("", { id: "" })).toThrowError(
        /Invalid media id/,
      );
    });
  });
});
