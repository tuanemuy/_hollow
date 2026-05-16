/**
 * Pure HTML mutation for note media insertion.
 *
 * The note sanitizer's `MEDIA_ID_FROM_URL = /\/media\/([0-9a-z-]+)/i`
 * (app/core/domain/note/service.ts) extracts media references from
 * `<img>`/`<video>`/`<audio>`/`<source>` `src` attributes that follow
 * the `/media/<id>` form. R2-direct URLs or `data-media-ref` attributes
 * are **not** picked up, so a bad inserter risks the orphan-purger
 * silently dropping live media. See ADR-009.
 *
 * This module owns the "append a media reference to an HTML string"
 * operation and nothing else. The rest of the editor pipeline trusts
 * the resulting `<img>` to round-trip through `HtmlSanitizer` cleanly.
 */

export type InsertMediaInput = Readonly<{
  id: string;
  alt?: string;
}>;

const ID_PATTERN = /^[0-9a-z-]+$/i;

/**
 * Append `<img src="/media/<id>" alt="">` to the supplied HTML string.
 *
 * - `id` is validated against `[0-9a-z-]+` so a malformed media id can
 *   never inject attribute-level HTML. Invalid ids throw.
 * - `alt` is HTML-escaped before insertion. `undefined` collapses to
 *   the empty string per sanitizer expectations.
 * - The trailing wrapper is `<p>` so the inserted node stays a block
 *   sibling rather than nesting inside an existing inline run.
 */
export function insertMediaIntoHtml(
  html: string,
  input: InsertMediaInput,
): string {
  if (!ID_PATTERN.test(input.id)) {
    throw new Error(`Invalid media id: ${input.id}`);
  }
  const altAttr = escapeHtmlAttribute(input.alt ?? "");
  const tag = `<p><img src="/media/${input.id}" alt="${altAttr}" /></p>`;
  const trimmed = html.trimEnd();
  if (trimmed.length === 0) return tag;
  return `${trimmed}\n${tag}`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
