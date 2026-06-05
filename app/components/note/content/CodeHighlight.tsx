"use client";

import { useEffect, useRef } from "react";

/**
 * Client-only enhancer that syntax-highlights code blocks in a read-only
 * note body (Issue #498 / ADR-001).
 *
 * Render it as a sibling of the `.note-detail-content` element whose
 * markup is injected via `dangerouslySetInnerHTML`. On mount it locates
 * that element within the shared parent (by class, so an element inserted
 * between the two does not silently break it) and walks its `<pre>` blocks
 * (the nested `<code>` if present, otherwise the `<pre>` itself), replacing
 * their plain text with `<span class="shiki-token-*">` groups. The saved
 * HTML is never modified — highlighting is a display-only derivation, so
 * SSR output stays plain and the view degrades gracefully without JS.
 *
 * For live previews whose sibling markup changes (e.g. the HTML editor),
 * pass `contentKey` so the effect re-runs whenever the rendered HTML
 * changes.
 */
export type CodeHighlightProps = Readonly<{ contentKey?: string }>;

export function CodeHighlight({ contentKey }: CodeHighlightProps = {}) {
  const markerRef = useRef<HTMLSpanElement | null>(null);

  // The highlighter reads the already-rendered sibling DOM rather than a
  // prop. `contentKey` re-triggers the effect for live previews; it is
  // debounced so per-keystroke previews (HtmlEditor) do not re-tokenize on
  // every change (Issue #498 review W-P-002). The `import.meta.env.SSR`
  // guard keeps shiki out of the Workers (SSR/RSC) bundle entirely
  // (ADR-005): Vite tree-shakes this branch for the SSR targets, so the
  // dynamic `import()` and its chunks never reach `dist/server`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-highlight when contentKey changes
  useEffect(() => {
    if (import.meta.env.SSR) return;
    const marker = markerRef.current;
    // Resolve the content root within the shared parent by class, so an
    // element inserted between marker and content does not break it
    // (review W-F-001).
    const content =
      marker?.parentElement?.querySelector(".note-detail-content") ?? null;
    if (content === null) return;
    const timer = setTimeout(() => {
      void (async () => {
        const { highlightCodeElement } = await import("./highlighter");
        for (const pre of content.querySelectorAll("pre")) {
          const code = pre.querySelector("code");
          void highlightCodeElement(code ?? pre);
        }
      })();
    }, 150);
    return () => clearTimeout(timer);
  }, [contentKey]);

  return <span ref={markerRef} hidden aria-hidden="true" />;
}
