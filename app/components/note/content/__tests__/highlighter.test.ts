// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { highlightCodeElement, resolveLang } from "../highlighter";

/**
 * Issue #498: pins the engine-independent contract of the client-only
 * highlighter.
 *
 * - `resolveLang` maps `class="language-X"` (incl. aliases) to a bundled
 *   grammar id and falls back to `plaintext` for unknown / missing langs.
 * - `highlightCodeElement` preserves `textContent` exactly (it only
 *   re-wraps the same characters in `<span>`s) and maps sentinel colors
 *   to `shiki-token-*` classes.
 * - A tokenize failure leaves the element as plain text (best-effort).
 *
 * shiki itself is mocked: the real engine is heavy and client-only, and
 * the sentinel-theme → class mapping is what we want to verify here.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function makeCode(text: string, lang?: string): HTMLElement {
  const el = document.createElement("code");
  if (lang !== undefined) el.className = `language-${lang}`;
  el.textContent = text;
  return el;
}

describe("resolveLang", () => {
  it("resolves a bundled language", () => {
    expect(resolveLang(makeCode("x", "typescript"))).toBe("typescript");
  });

  it("resolves aliases to their canonical grammar id", () => {
    expect(resolveLang(makeCode("x", "ts"))).toBe("typescript");
    expect(resolveLang(makeCode("x", "js"))).toBe("javascript");
    expect(resolveLang(makeCode("x", "bash"))).toBe("shellscript");
    expect(resolveLang(makeCode("x", "py"))).toBe("python");
  });

  it("is case-insensitive", () => {
    expect(resolveLang(makeCode("x", "TypeScript"))).toBe("typescript");
  });

  it("falls back to plaintext for unknown or missing language", () => {
    expect(resolveLang(makeCode("x", "brainfuck"))).toBe("plaintext");
    expect(resolveLang(makeCode("x"))).toBe("plaintext");
  });
});

describe("highlightCodeElement", () => {
  it("returns early without touching plaintext code", async () => {
    const el = makeCode("hello world");
    await highlightCodeElement(el);
    expect(el.childElementCount).toBe(0);
    expect(el.textContent).toBe("hello world");
  });

  it("wraps tokens in shiki-token-* spans and preserves textContent", async () => {
    // Mock the shiki engine modules the highlighter loads lazily so we
    // control the token stream (sentinel colors per ADR-003).
    vi.doMock("shiki/core", () => ({
      createHighlighterCore: async () => ({
        codeToTokens: () => ({
          tokens: [
            [
              { content: "const", color: "#000001" },
              { content: " x = ", color: "#BBBBBB" },
              { content: "42", color: "#000005" },
            ],
          ],
        }),
      }),
    }));
    vi.doMock("shiki/engine/javascript", () => ({
      createJavaScriptRegexEngine: () => ({}),
    }));
    // Each grammar module just needs a default export.
    for (const lang of [
      "javascript",
      "typescript",
      "tsx",
      "jsx",
      "json",
      "html",
      "css",
      "shellscript",
      "python",
      "go",
      "rust",
      "sql",
      "yaml",
      "markdown",
    ]) {
      vi.doMock(`@shikijs/langs/${lang}`, () => ({
        default: [{ name: lang }],
      }));
    }
    vi.resetModules();
    const { highlightCodeElement: hl } = await import("../highlighter");

    const el = makeCode("const x = 42", "javascript");
    await hl(el);

    expect(el.textContent).toBe("const x = 42");
    expect(el.querySelector(".shiki-token-keyword")?.textContent).toBe("const");
    expect(el.querySelector(".shiki-token-number")?.textContent).toBe("42");
    // The un-sentineled token stays a bare text node (no span).
    const spans = el.querySelectorAll("span");
    expect(spans).toHaveLength(2);
  });

  it("leaves the element plain when tokenization throws (best-effort)", async () => {
    vi.doMock("shiki/core", () => ({
      createHighlighterCore: async () => ({
        codeToTokens: () => {
          throw new Error("boom");
        },
      }),
    }));
    vi.doMock("shiki/engine/javascript", () => ({
      createJavaScriptRegexEngine: () => ({}),
    }));
    for (const lang of [
      "javascript",
      "typescript",
      "tsx",
      "jsx",
      "json",
      "html",
      "css",
      "shellscript",
      "python",
      "go",
      "rust",
      "sql",
      "yaml",
      "markdown",
    ]) {
      vi.doMock(`@shikijs/langs/${lang}`, () => ({
        default: [{ name: lang }],
      }));
    }
    vi.resetModules();
    const { highlightCodeElement: hl } = await import("../highlighter");

    const el = makeCode("const x = 1", "javascript");
    await hl(el);
    expect(el.querySelector("span")).toBeNull();
    expect(el.textContent).toBe("const x = 1");
  });
});
