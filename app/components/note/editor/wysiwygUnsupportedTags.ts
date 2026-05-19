/**
 * Pure helpers for detecting tags in note HTML that will be silently
 * dropped when the WYSIWYG (TipTap) tab takes over editing (Issue #37).
 *
 * The store-side HTML sanitiser is permissive — it preserves `<table>`,
 * `<mark>`, `<kbd>`, `<figure>` and similar elements so users can author
 * them in the HTML tab. TipTap, however, only understands the schema
 * shipped by StarterKit v3 + the Link / Image / Mention extensions
 * configured in `WysiwygEditor.tsx`. Anything outside that intersection
 * is silently flattened on first parse, so once the WYSIWYG pane writes
 * its `getHTML()` back to the reducer the original markup is gone.
 *
 * Implementation notes:
 *
 * - The supported set is hand-curated against StarterKit v3 + Link +
 *   Image. If TipTap is upgraded (e.g. StarterKit v4 unbundles
 *   `Underline`) or new extensions are added, `WYSIWYG_SUPPORTED_TAGS`
 *   must be updated in lockstep with `WysiwygEditor.tsx`. The set
 *   intentionally includes alias tags (`b`, `i`, `u`, `div`, `span`)
 *   that the sanitiser allows and TipTap losslessly normalises — they
 *   are not warning material.
 * - `detectUnsupportedTags` expects HTML that has already passed the
 *   server-side sanitiser, so `<script>` / `<style>` / CDATA blocks are
 *   not handled here. HTML comments are stripped pre-scan because the
 *   sanitiser allows them and they would otherwise confuse the
 *   tag-name regex.
 * - The scan uses a regex rather than DOMParser so the helper runs in
 *   SSR / Cloudflare Worker / Node test environments without pulling in
 *   `happy-dom`. It is O(n) and a few hundred microseconds even on 10
 *   万字 bodies, so callers can run it on the main thread during
 *   `onCreate` without risking input latency.
 */

/**
 * Tags that TipTap's WYSIWYG mode can faithfully round-trip.
 *
 * Members are split into two groups:
 *
 * 1. Tags that StarterKit v3 + Link + Image emit (`p`, `h1`–`h6`, `ul`,
 *    `ol`, `li`, `blockquote`, `pre`, `code`, `strong`, `em`, `s`,
 *    `hr`, `a`, `img`, `br`).
 * 2. Alias / wrapper tags that the sanitiser allows and TipTap
 *    losslessly maps onto its own marks (`b`→`strong`, `i`→`em`,
 *    `u`→underline, `span`/`div` collapse into block context). Treating
 *    these as "supported" avoids false-positive warnings on the vast
 *    majority of existing notes.
 *
 * `section` / `article` are intentionally absent — StarterKit does not
 * model them, so their children are flattened into a `<p>` chain and
 * the wrapper is dropped. That is exactly the silent loss this Issue
 * warns about, so they belong on the unsupported side.
 *
 * Note on `u`: StarterKit v3 bundles the `Underline` extension. If a
 * future TipTap release moves it back into its own package, drop `u`
 * from this set and re-validate `WysiwygEditor.tsx`'s extension list.
 */
export const WYSIWYG_SUPPORTED_TAGS: ReadonlySet<string> = new Set([
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
  "span",
  "div",
  "b",
  "i",
  "u",
]);

const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TAG_NAME_RE = /<\s*([a-zA-Z][a-zA-Z0-9-]*)/g;

/**
 * Return the sorted, de-duplicated set of element names appearing in
 * `html` that fall outside `WYSIWYG_SUPPORTED_TAGS`.
 *
 * Input must be HTML that has already cleared the server-side
 * sanitiser (`<script>` / `<style>` and unsafe URI schemes are not
 * guarded against here). The result is the names callers should
 * surface to the user as "will be lost in WYSIWYG mode", in
 * alphabetical order so the rendered list is stable.
 *
 * Returns `[]` for empty input or when every tag is supported.
 */
export function detectUnsupportedTags(html: string): readonly string[] {
  if (html.length === 0) return [];
  const withoutComments = html.replace(COMMENT_RE, "");
  const found = new Set<string>();
  for (const match of withoutComments.matchAll(TAG_NAME_RE)) {
    const name = match[1]?.toLowerCase();
    if (name === undefined) continue;
    if (WYSIWYG_SUPPORTED_TAGS.has(name)) continue;
    found.add(name);
  }
  if (found.size === 0) return [];
  return [...found].sort();
}
