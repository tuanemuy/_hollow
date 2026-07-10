import { describe, expect, it } from "vitest";
import { TemplateHtmlRenderer } from "@/core/adapters/export/htmlRenderer";
import { FrontMatter } from "@/core/domain/note/valueObject";

const renderer = new TemplateHtmlRenderer();

function wrap(designTokens: Readonly<Record<string, string>>): Promise<string> {
  return renderer.wrapForExport("<p>body</p>", {
    includeFrontMatter: false,
    frontMatter: FrontMatter.empty(),
    designTokens,
  });
}

describe("TemplateHtmlRenderer.wrapForExport — design token style block", () => {
  it("emits keys with a single `--` prefix (no `----` double prefix)", async () => {
    const html = await wrap({ "--color-accent": "#ff0000" });
    expect(html).toContain("--color-accent: #ff0000;");
    expect(html).not.toContain("----color-accent");
  });

  it("preserves multi-value tokens containing commas, spaces, and quotes", async () => {
    const fontStack =
      '"Helvetica Neue", Arial, "Hiragino Sans", Meiryo, sans-serif';
    const html = await wrap({ "--font-sans": fontStack });
    expect(html).toContain(`--font-sans: ${fontStack};`);
  });

  it("sanitizes CSS comment terminators and newlines in values", async () => {
    const html = await wrap({
      "--color-accent": "red */ } body { color: blue",
    });
    expect(html).not.toContain("*/");
    // The declaration stays on a single line inside the `:root` block.
    expect(html).toContain("--color-accent: red  } body { color: blue;");
  });

  it("neutralises CSS comment openers (/*) in values", async () => {
    const html = await wrap({ "--color-accent": "red /* comment" });
    expect(html).not.toContain("/*");
    expect(html).toContain("--color-accent: red  comment;");
  });

  it("strips newlines from values so they cannot break out of the block", async () => {
    const html = await wrap({ "--color-accent": "red\n} body { color: blue" });
    expect(html).toContain("--color-accent: red } body { color: blue;");
    expect(html).not.toMatch(/--color-accent: red\n/);
  });

  it("omits the <style> block entirely for an empty token map", async () => {
    const html = await wrap({});
    expect(html).not.toContain("<style>");
    expect(html).not.toContain(":root");
  });

  it("passes valid keys (--[a-z0-9-]+) through escapeCssIdent unchanged", async () => {
    const html = await wrap({
      "--color-accent-hover": "#111",
      "--radius-md": "8px",
    });
    expect(html).toContain("--color-accent-hover: #111;");
    expect(html).toContain("--radius-md: 8px;");
  });

  it("replaces stray disallowed characters in a key with `-` (defense-in-depth)", async () => {
    // A key that slipped past the VO with an illegal char is neutralised
    // rather than emitted verbatim into the selector.
    const html = await wrap({ "--bad key!": "#000" });
    expect(html).toContain("--bad-key-: #000;");
    expect(html).not.toContain("--bad key!");
  });
});
