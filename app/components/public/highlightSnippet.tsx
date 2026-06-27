import { SEARCH_HIT_MARK } from "./styles";

const MARK_OPEN = "<mark>";
const MARK_CLOSE = "</mark>";

/**
 * Renders an FTS5-highlighted search string (snippet or title) as React nodes.
 *
 * The backend wraps matched terms in fixed `<mark>` / `</mark>` markers via
 * either `snippet(fts, 1, '<mark>', '</mark>', '…', ...)` (body snippet) or
 * `highlight(fts, 0, '<mark>', '</mark>')` (title). This splits on those markers
 * and renders the inner segments as styled `<mark>` elements, leaving every
 * other segment as a plain text node.
 *
 * WHY no `dangerouslySetInnerHTML`: the `<mark>` markers are the only trusted
 * boundary (emitted by our own `snippet()` / `highlight()` call); the
 * surrounding text is user-authored note content. Rendering segments as React
 * text nodes lets React auto-escape that user text, so a literal `<mark>` (or
 * `<script>`) inside the highlighted string can at worst cause a cosmetic
 * mis-split — never HTML injection / XSS.
 *
 * Returns the original string unchanged when no markers are present (back-compat).
 */
export function highlightSnippet(snippet: string): React.ReactNode {
  if (!snippet.includes(MARK_OPEN)) {
    return snippet;
  }

  const nodes: React.ReactNode[] = [];
  let rest = snippet;
  let index = 0;

  while (rest.length > 0) {
    const openAt = rest.indexOf(MARK_OPEN);
    if (openAt === -1) {
      nodes.push(rest);
      break;
    }

    if (openAt > 0) {
      nodes.push(rest.slice(0, openAt));
    }

    const afterOpen = rest.slice(openAt + MARK_OPEN.length);
    const closeAt = afterOpen.indexOf(MARK_CLOSE);
    if (closeAt === -1) {
      // Unterminated marker: render the remainder as plain text.
      nodes.push(afterOpen);
      break;
    }

    const inner = afterOpen.slice(0, closeAt);
    nodes.push(
      <mark key={index} className={SEARCH_HIT_MARK}>
        {inner}
      </mark>,
    );
    index += 1;
    rest = afterOpen.slice(closeAt + MARK_CLOSE.length);
  }

  return nodes;
}
