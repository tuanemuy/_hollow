import type { ContentHtml, InternalLinkRef } from "../valueObject";

export type NoteBodySurface = "auth" | "public";

/**
 * Display-only rendering port for note bodies.
 *
 * The stored `ContentHtml` keeps `[[wikilink]]` / `#hashtag` tokens
 * verbatim — that is a deliberate invariant the save / export pipeline
 * depends on (`NoteService.assembleFromInputs`, `extractMetadataFromHtml`,
 * the export renderers). For the *reading* surface (P11 note detail) we
 * want those tokens marked up as pills, without ever touching the
 * persisted body. This port owns that one-way, read-path transformation.
 *
 * `renderForDisplay` takes the stored body plus the aggregate's resolved
 * `InternalLinkRef[]` (the domain value objects, not the DTO projection)
 * and returns a display HTML string with:
 *
 * - `[[target|display]]` → an `<a class="wikilink">` linking to the
 *   resolved note when the matching ref carries a `resolvedNoteId`, or a
 *   non-linking `<span class="wikilink" data-unresolved>` otherwise.
 * - `#tag` → on the auth surface an `<a class="hashtag">` linking to the
 *   home tag filter; on the public surface a non-linking
 *   `<span class="hashtag">#tag</span>`.
 *
 * The optional `surface` selects the display context (defaults to
 * `"auth"` for backward compatibility):
 *
 * - `"auth"` — wikilinks resolve to the auth route `/notes/$id` and
 *   hashtags become links to the home tag filter (`/?tagNames=...`).
 * - `"public"` — wikilinks resolve to the public route
 *   `/notes/public/$id` (so private targets are gated by that route's
 *   NotFound and never leak), and hashtags stay non-linking (no public
 *   tag-filter route exists).
 *
 * `surface` is a pure display-context token carrying no I/O, so this port
 * stays in the domain. Refs are matched to body tokens by the same
 * `(kind, target)` key the extraction pass uses (title trimmed, id判定 =
 * UUIDv7); the refs are therefore effectively a `resolvedNoteId` lookup
 * table. The implementation must never mark up tokens inside `<pre>` /
 * `<code>` subtrees, inside an existing `<a>`, or inside attribute
 * values, and must escape every target / display string it emits.
 *
 * Trust boundary: `html` is assumed to be an already-sanitized stored body
 * (the output of `htmlSanitizer.sanitize` via `assembleFromInputs`). This
 * port adds escaped markup on top of safe HTML — it is NOT a sanitizer.
 * Do not feed unsanitized or differently-sanitized HTML through it.
 */
export interface NoteBodyRenderer {
  renderForDisplay(
    html: ContentHtml,
    refs: readonly InternalLinkRef[],
    options?: { surface: NoteBodySurface },
  ): string;
}
