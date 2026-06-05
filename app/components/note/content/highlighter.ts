/**
 * Client-only syntax highlighter for note code blocks (Issue #498).
 *
 * Highlighting is a display-only derivation: it never touches the saved
 * `contentHtml`. Both the read-only views and the inline editor call
 * {@link highlightCodeElement} to replace a plain-text `<code>` / `<pre>`
 * with `<span class="shiki-token-*">` groups whose colors resolve at
 * runtime via `var(--code-*)` in `app/styles/index.css`.
 *
 * Invariants (ADR-005):
 *
 * - **No top-level shiki import.** shiki core / grammars / the theme are
 *   imported only inside async functions via `await import()`, so the
 *   library never enters the Cloudflare Workers (RSC/SSR) bundle. This
 *   module must be loaded from client code (`useEffect`) only.
 * - **JavaScript regex engine, no WASM** (`createJavaScriptRegexEngine`,
 *   `forgiving: true`).
 *
 * Token classification uses a "sentinel theme" (ADR-003): instead of
 * reading TextMate scope names, a minimal custom theme maps scope groups
 * to five sentinel hex colors. `codeToTokens` then yields those sentinels
 * as `token.color`, which {@link SENTINEL_TO_CLASS} turns into CSS
 * classes. This is engine- and version-independent.
 */

import type {
  HighlighterCore,
  LanguageRegistration,
  ThemeRegistrationRaw,
} from "shiki/core";

const SENTINEL_KEYWORD = "#000001";
const SENTINEL_STRING = "#000002";
const SENTINEL_COMMENT = "#000003";
const SENTINEL_FUNCTION = "#000004";
const SENTINEL_NUMBER = "#000005";

const SENTINEL_TO_CLASS: ReadonlyMap<string, string> = new Map([
  [SENTINEL_KEYWORD, "shiki-token-keyword"],
  [SENTINEL_STRING, "shiki-token-string"],
  [SENTINEL_COMMENT, "shiki-token-comment"],
  [SENTINEL_FUNCTION, "shiki-token-function"],
  [SENTINEL_NUMBER, "shiki-token-number"],
]);

/**
 * Maps representative TextMate scopes to the five sentinel colors. fg/bg
 * are intentionally omitted so shiki fills a default (`#bbbbbb`) that
 * cannot collide with the sentinel range (ADR-003 implementation note).
 */
const SENTINEL_THEME: ThemeRegistrationRaw = {
  name: "hollow-sentinel",
  settings: [
    {
      scope: [
        "keyword",
        "keyword.control",
        "keyword.operator",
        "storage",
        "storage.type",
        "storage.modifier",
        "variable.language",
        "constant.language",
      ],
      settings: { foreground: SENTINEL_KEYWORD },
    },
    {
      scope: [
        "string",
        "string.quoted",
        "string.template",
        "constant.character",
        "punctuation.definition.string",
      ],
      settings: { foreground: SENTINEL_STRING },
    },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: SENTINEL_COMMENT },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call",
        "variable.function",
      ],
      settings: { foreground: SENTINEL_FUNCTION },
    },
    {
      scope: ["constant.numeric", "constant.numeric.integer"],
      settings: { foreground: SENTINEL_NUMBER },
    },
  ],
};

/**
 * Languages bundled into the highlighter. The grammar id used by shiki is
 * the key; `class="language-X"` resolves X against this set (and its
 * aliases) via {@link resolveLang}. Anything else falls back to
 * `plaintext` (no decoration).
 */
const LANG_LOADERS: ReadonlyMap<string, () => Promise<unknown>> = new Map([
  ["javascript", () => import("@shikijs/langs/javascript")],
  ["typescript", () => import("@shikijs/langs/typescript")],
  ["tsx", () => import("@shikijs/langs/tsx")],
  ["jsx", () => import("@shikijs/langs/jsx")],
  ["json", () => import("@shikijs/langs/json")],
  ["html", () => import("@shikijs/langs/html")],
  ["css", () => import("@shikijs/langs/css")],
  ["shellscript", () => import("@shikijs/langs/shellscript")],
  ["python", () => import("@shikijs/langs/python")],
  ["go", () => import("@shikijs/langs/go")],
  ["rust", () => import("@shikijs/langs/rust")],
  ["sql", () => import("@shikijs/langs/sql")],
  ["yaml", () => import("@shikijs/langs/yaml")],
  ["markdown", () => import("@shikijs/langs/markdown")],
]);

/** Aliases accepted in `class="language-X"` → canonical grammar id. */
const LANG_ALIASES: ReadonlyMap<string, string> = new Map([
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["ts", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["py", "python"],
  ["rs", "rust"],
  ["golang", "go"],
  ["yml", "yaml"],
  ["md", "markdown"],
  ["sh", "shellscript"],
  ["bash", "shellscript"],
  ["shell", "shellscript"],
  ["zsh", "shellscript"],
  ["console", "shellscript"],
  ["htm", "html"],
]);

let highlighterPromise: Promise<HighlighterCore> | null = null;

/** Lazily create the singleton highlighter (client-only, no WASM). */
async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterPromise === null) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
        await Promise.all([
          import("shiki/core"),
          import("shiki/engine/javascript"),
        ]);
      const langs = await Promise.all(
        Array.from(LANG_LOADERS.values()).map((load) => load()),
      );
      return createHighlighterCore({
        themes: [SENTINEL_THEME],
        // Each grammar module's default export is a `LanguageRegistration[]`.
        langs: langs.map(
          (m) => (m as { default: LanguageRegistration[] }).default,
        ),
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      });
    })().catch((e) => {
      // Reset so a transient failure can be retried on the next call.
      highlighterPromise = null;
      throw e;
    });
  }
  return highlighterPromise;
}

/**
 * Resolve the grammar id from a `<code class="language-X">` element.
 * Returns `"plaintext"` when no/unknown language is declared (ADR-005).
 */
export function resolveLang(el: Element): string {
  for (const cls of el.classList) {
    if (cls.startsWith("language-")) {
      const raw = cls.slice("language-".length).toLowerCase();
      const canonical = LANG_ALIASES.get(raw) ?? raw;
      if (LANG_LOADERS.has(canonical)) return canonical;
      return "plaintext";
    }
  }
  return "plaintext";
}

/**
 * Highlight a code element in place. `el.textContent` (the plain source)
 * is the single source of truth; this tokenizes it and replaces the
 * children with `<span class="shiki-token-*">` groups. `el.textContent`
 * after replacement equals the original (no characters added/removed).
 *
 * Best-effort: any load/tokenize failure is swallowed and the element is
 * left as plain text.
 */
export async function highlightCodeElement(el: Element): Promise<void> {
  const source = el.textContent ?? "";
  if (source.length === 0) return;
  const lang = resolveLang(el);
  if (lang === "plaintext") return;

  try {
    const highlighter = await getHighlighter();
    const { tokens } = highlighter.codeToTokens(source, {
      lang,
      theme: SENTINEL_THEME.name ?? "hollow-sentinel",
    });

    const doc = el.ownerDocument;
    const fragment = doc.createDocumentFragment();
    tokens.forEach((line, lineIndex) => {
      if (lineIndex > 0) fragment.appendChild(doc.createTextNode("\n"));
      for (const token of line) {
        if (token.content.length === 0) continue;
        const cls =
          token.color === undefined
            ? undefined
            : SENTINEL_TO_CLASS.get(token.color.toLowerCase());
        if (cls === undefined) {
          fragment.appendChild(doc.createTextNode(token.content));
          continue;
        }
        const span = doc.createElement("span");
        span.className = cls;
        span.textContent = token.content;
        fragment.appendChild(span);
      }
    });

    el.replaceChildren(fragment);
  } catch {
    // best-effort: keep the plain text on any failure.
  }
}
