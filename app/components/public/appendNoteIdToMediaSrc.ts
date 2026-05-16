/**
 * Rewrite `<img|video|audio|source src="/media/<id>" ...>` occurrences
 * inside a sanitized note body so the `src` carries `?noteId=<noteId>`.
 *
 * The `/media/<mediaId>` route delegates view-permission to
 * `MediaService.assertViewableBy`, which requires either ownership or a
 * `relatedNoteId` whose `PublicationState.visibility` is `public` /
 * `unlisted`. For public note pages the viewer is usually anonymous, so
 * without the note context every `<img>` would 4xx as `MediaNotViewable`.
 *
 * This transform is intentionally a textual rewrite: the body has
 * already been validated and serialized by `HtmlSanitizer` at write
 * time, and adding a query parameter cannot widen the allowed token
 * shapes (`MEDIA_ID_FROM_URL` already tolerates trailing chars after the
 * id). We avoid a re-parse so the public render path stays cheap and
 * does not pull a DOM dependency into the public bundle.
 *
 * Already-present `?noteId=` query is left untouched — a future caller
 * could legitimately pre-rewrite the body to a different note context
 * (e.g. server-side view), and we should not silently overwrite it.
 */

// Match: <img|video|audio|source ... src="/media/<id>..." ...>
//
// - `src` may be single- or double-quoted.
// - The value must start with `/media/` to bound the rewrite to this
//   exact route (no protocol-relative / absolute URLs).
// - `[^"'<>]*` after the id keeps the match scoped within the attr.
const MEDIA_SRC_ATTR =
  /(<(?:img|video|audio|source)\b[^>]*?\bsrc=)(["'])(\/media\/[^"'<>]*)\2/gi;

const HAS_QUERY = /[?]/;

export function appendNoteIdToMediaSrc(html: string, noteId: string): string {
  if (html.length === 0 || noteId.length === 0) return html;
  const encoded = encodeURIComponent(noteId);
  return html.replace(MEDIA_SRC_ATTR, (_match, prefix, quote, url) => {
    if (HAS_QUERY.test(url)) {
      // Skip if the URL already carries any query (potentially noteId).
      // We deliberately don't try to upgrade missing-noteId queries —
      // see the module-level note.
      return `${prefix}${quote}${url}${quote}`;
    }
    return `${prefix}${quote}${url}?noteId=${encoded}${quote}`;
  });
}
