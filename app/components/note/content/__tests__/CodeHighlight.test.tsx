// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeHighlight } from "../CodeHighlight";

/**
 * Issue #498: the read-only enhancer (plan step 3) locates the sibling
 * `.note-detail-content` within the shared parent and highlights each of
 * its `<pre>` blocks — the nested `<code>` if present, otherwise the
 * `<pre>` itself. shiki is mocked so we verify only the DOM-walking /
 * target-resolution contract, not the engine.
 */

const highlightCodeElement = vi.fn((_el: Element) => Promise.resolve());
vi.mock("../highlighter", () => ({
  highlightCodeElement: (el: Element) => highlightCodeElement(el),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  highlightCodeElement.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

// The effect debounces (150ms) before importing the highlighter.
async function flushDebounce(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  });
}

describe("CodeHighlight", () => {
  it("highlights the <code> child of a <pre> and a bare <pre> in the sibling content", async () => {
    await act(async () => {
      root.render(
        <div>
          <div
            className="note-detail-content"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: test fixture
            dangerouslySetInnerHTML={{
              __html: "<pre><code>a</code></pre><pre>b</pre>",
            }}
          />
          <CodeHighlight />
        </div>,
      );
    });
    await flushDebounce();

    expect(highlightCodeElement).toHaveBeenCalledTimes(2);
    const tags = highlightCodeElement.mock.calls.map((c) =>
      (c[0] as Element).tagName.toLowerCase(),
    );
    // First <pre> has a <code> child → its <code> is the target; the bare
    // <pre> is its own target.
    expect(tags).toContain("code");
    expect(tags).toContain("pre");
  });

  it("does nothing when there is no sibling content", async () => {
    await act(async () => {
      root.render(
        <div>
          <CodeHighlight />
        </div>,
      );
    });
    await flushDebounce();
    expect(highlightCodeElement).not.toHaveBeenCalled();
  });

  it("resolves content by class even when an element sits between marker and content", async () => {
    await act(async () => {
      root.render(
        <div>
          <div
            className="note-detail-content"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: test fixture
            dangerouslySetInnerHTML={{ __html: "<pre><code>x</code></pre>" }}
          />
          <hr />
          <CodeHighlight />
        </div>,
      );
    });
    await flushDebounce();
    // previousElementSibling would be <hr> here; resolving by class keeps it
    // working (review W-F-001).
    expect(highlightCodeElement).toHaveBeenCalledTimes(1);
  });
});
