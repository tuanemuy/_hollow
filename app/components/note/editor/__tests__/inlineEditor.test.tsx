// @vitest-environment happy-dom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineEditor } from "@/components/note/editor/InlineEditor";
import { insertMediaIntoHtml } from "@/components/note/editor/mediaInsert";

// shiki is client-only and heavy; the inline editor loads it via a
// dynamic import for `<pre>` highlighting. Mock it so these
// structural tests stay deterministic and never pull the real engine.
vi.mock("@/components/note/content/highlighter", () => ({
  highlightCodeElement: vi.fn(async () => {}),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Pins the structural-preservation contract of the inline editor.
 *
 * - Editable allow-list applied to block elements, skipping only the
 *   pure containers of editable blocks (e.g. the `<li>` in
 *   `<li><p>…</p></li>`); blocks without editable descendants are
 *   decorated even with no direct text child (`<p><img></p>`, empty
 *   `<p>` — Issue #287).
 * - Inline decorations (`<strong>` / `<em>` …) preserved.
 * - `Enter` / `Tab` keydown is prevented at the host so the structure
 *   cannot grow new blocks via the browser default behaviour.
 * - Structural mutations outside the allowed text-only churn are rolled
 *   back to the original snapshot.
 * - Pasted HTML is plain-text-ified.
 * - Parse failures fire `onInitFailed` exactly once; an empty value is
 *   not a failure (we stay in inline mode with an empty host).
 * - External `value` changes rebuild the DOM without firing `onChange`
 *   as a self-emit.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

async function flushMutations(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
  });
}

function findHost(): HTMLElement {
  const host = container.querySelector<HTMLElement>(".note-detail-content");
  if (host === null) throw new Error("inline editor host not found");
  return host;
}

function requireNode<T extends Node>(node: T | null | undefined): T {
  if (node == null) throw new Error("expected node to be present");
  return node;
}

describe("InlineEditor structural preservation", () => {
  it("keeps <table> structure and only marks <td> contentEditable", async () => {
    await act(async () => {
      root.render(
        <InlineEditor
          value="<table><tbody><tr><td>foo</td></tr></tbody></table>"
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    expect(host.querySelector("table")).not.toBeNull();
    expect(host.querySelector("tr")).not.toBeNull();
    const td = host.querySelector("td");
    expect(td).not.toBeNull();
    expect(td?.getAttribute("contenteditable")).toBe("true");
    const table = host.querySelector("table");
    expect(table?.getAttribute("contenteditable")).toBeNull();
  });

  it("preserves inline decorations and decorates the wrapping block as editable", async () => {
    await act(async () => {
      root.render(
        <InlineEditor
          value="<p>foo <strong>bar</strong> baz</p>"
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    const p = host.querySelector("p");
    expect(p?.getAttribute("contenteditable")).toBe("true");
    expect(host.querySelector("strong")?.textContent).toBe("bar");
  });

  it("rolls back to snapshot when a non-text child is force-removed", async () => {
    await act(async () => {
      root.render(
        <InlineEditor
          value="<table><tbody><tr><td>foo</td><td>bar</td></tr></tbody></table>"
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    expect(host.querySelectorAll("td")).toHaveLength(2);
    const tr = host.querySelector("tr");
    expect(tr).not.toBeNull();
    const firstCell = requireNode(tr?.firstChild);
    await act(async () => {
      tr?.removeChild(firstCell);
    });
    await flushMutations();
    expect(host.querySelectorAll("td")).toHaveLength(2);
  });

  it("prevents Enter at the host so new blocks cannot appear", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("prevents Tab at the host so focus does not escape into the next block", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("plain-text-ifies pasted HTML so the structure does not change", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const p = host.querySelector("p");
    expect(p).not.toBeNull();
    const sel = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(requireNode(p));
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const dt = new DataTransfer();
    dt.setData("text/plain", "<script>x</script>");
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      host.dispatchEvent(pasteEvent);
    });
    await flushMutations();
    expect(host.querySelector("script")).toBeNull();
    expect(host.innerHTML).not.toContain("<script>");
    // The pasted text is inserted as a literal text node into the
    // <p> at the caret. Pinning the insertion
    // point — not just the host-wide textContent — guarantees the
    // paste landed where the caret was, not at an outer fallback.
    expect(host.textContent ?? "").toContain("<script>x</script>");
    expect(host.querySelector("p")?.textContent ?? "").toContain(
      "<script>x</script>",
    );
  });

  it("does not call onInitFailed for an empty value and stays mounted with an empty host", async () => {
    const onInitFailed = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value=""
          onChange={vi.fn()}
          onInitFailed={onInitFailed}
        />,
      );
    });
    const host = findHost();
    expect(host.childElementCount).toBe(0);
    expect(onInitFailed).not.toHaveBeenCalled();
  });

  it("rebuilds DOM when value changes externally without re-emitting via onChange", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={onChange} />);
    });
    let host = findHost();
    expect(host.querySelector("p")?.textContent).toBe("foo");
    await act(async () => {
      root.render(
        <InlineEditor value="<p>bar</p><p>baz</p>" onChange={onChange} />,
      );
    });
    host = findHost();
    expect(host.querySelectorAll("p")).toHaveLength(2);
    expect(host.querySelector("p")?.textContent).toBe("bar");
    // No mutation-emit should fire for an external value swap.
    await flushMutations();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not rebuild the host DOM when the emitted value round-trips back (Issue #669 focus preservation)", async () => {
    // Controlled-editor wiring: keystroke → emit(onChange) → parent state
    // update → same HTML comes back as the `value` prop. The live DOM
    // (and therefore focus / caret) must survive that round-trip.
    const onChange = vi.fn();
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={onChange} />);
    });
    const host = findHost();
    const p = host.querySelector("p");
    const textNode = p?.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
    await act(async () => {
      (textNode as Text).textContent = "foobar";
    });
    await flushMutations();
    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as string;
    expect(emitted).toContain("foobar");

    // Feed the emitted HTML back as the value prop (round-trip).
    await act(async () => {
      root.render(<InlineEditor value={emitted} onChange={onChange} />);
    });
    await flushMutations();
    // Same element instances — the host was NOT rebuilt, so focus would
    // have been preserved in a real browser.
    expect(host.querySelector("p")).toBe(p);
    expect(host.querySelector("p")?.firstChild).toBe(textNode);
    // No echo emit either.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending debounced emit when an external value change rebuilds into a failure path (Issue #669)", async () => {
    // A keystroke schedules a debounced emit against the current host DOM.
    // If `value` then changes externally to something that fails to parse,
    // `rebuild` empties the host and bails — and it MUST also clear the
    // pending timer. Otherwise the stale timer fires against the now-empty
    // host and emits "" over the parent's content.
    const onChange = vi.fn();
    const onInitFailed = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<p>foo</p>"
          onChange={onChange}
          onInitFailed={onInitFailed}
        />,
      );
    });
    const host = findHost();
    const textNode = host.querySelector("p")?.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
    // Schedule the debounced emit (do NOT let the 50ms timer fire yet).
    await act(async () => {
      (textNode as Text).textContent = "foobar";
    });
    // External value change to a non-empty input that parses to an empty
    // body → rebuild takes the failure path, leaving the host empty.
    await act(async () => {
      root.render(
        <InlineEditor
          value="<!DOCTYPE html>"
          onChange={onChange}
          onInitFailed={onInitFailed}
        />,
      );
    });
    expect(onInitFailed).toHaveBeenCalledTimes(1);
    // Let the (cancelled) debounce window elapse: no "" must be emitted.
    await flushMutations();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("builds the host content under StrictMode double-invoked effects (Issue #669)", async () => {
    // StrictMode runs mount → cleanup → remount. The cleanup empties the
    // host AND must reset `lastEmittedHtmlRef` to null — otherwise the
    // remount's resync effect would treat `value` as a self-emit, skip the
    // rebuild, and leave the host empty. Pins the cleanup-null-reset
    // contract.
    await act(async () => {
      root.render(
        <StrictMode>
          <InlineEditor value="<p>foo</p>" onChange={vi.fn()} />
        </StrictMode>,
      );
    });
    const host = findHost();
    expect(host.querySelector("p")?.textContent).toBe("foo");
    expect(host.querySelector("p")?.getAttribute("contenteditable")).toBe(
      "true",
    );
  });

  it("disables contentEditable when disabled = true", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<p>foo</p>" onChange={vi.fn()} disabled />,
      );
    });
    const host = findHost();
    const p = host.querySelector("p");
    // disabled effect clears the attribute outright.
    expect(p?.getAttribute("contenteditable")).toBeNull();
    expect(host.hasAttribute("data-disabled")).toBe(true);
  });

  it("fires onInitFailed once when input is non-empty but parses to empty body", async () => {
    const onInitFailed = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<!DOCTYPE html>"
          onChange={vi.fn()}
          onInitFailed={onInitFailed}
        />,
      );
    });
    expect(onInitFailed).toHaveBeenCalledTimes(1);
  });

  it("guards onInitFailed so re-rendering with the same bad value does not re-fire", async () => {
    const onInitFailed = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<!DOCTYPE html>"
          onChange={vi.fn()}
          onInitFailed={onInitFailed}
        />,
      );
    });
    expect(onInitFailed).toHaveBeenCalledTimes(1);
    // Parent stalls the unmount; we re-render with the same bad value.
    // The once-only ref must not fire a second time.
    await act(async () => {
      root.render(
        <InlineEditor
          value="<!DOCTYPE html>"
          onChange={vi.fn()}
          onInitFailed={onInitFailed}
        />,
      );
    });
    expect(onInitFailed).toHaveBeenCalledTimes(1);
  });

  it("decorates both outer <blockquote> and inner <p> when mixed children appear", async () => {
    await act(async () => {
      root.render(
        <InlineEditor
          value="<blockquote>foo<p>bar</p></blockquote>"
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    const bq = host.querySelector("blockquote");
    const p = host.querySelector("p");
    expect(bq?.getAttribute("contenteditable")).toBe("true");
    expect(p?.getAttribute("contenteditable")).toBe("true");
  });

  it("decorates only the inner <p> inside <li><p>foo</p></li>, not the outer <li>", async () => {
    await act(async () => {
      root.render(
        <InlineEditor
          value="<ul><li><p>foo</p></li></ul>"
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    const li = host.querySelector("li");
    const p = host.querySelector("p");
    expect(li?.getAttribute("contenteditable")).toBeNull();
    expect(p?.getAttribute("contenteditable")).toBe("true");
  });

  it("decorates <pre> editable and lets inner <code> inherit editability (Issue #285)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<pre><code>x</code></pre>" onChange={vi.fn()} />,
      );
    });
    const host = findHost();
    const pre = host.querySelector("pre");
    const code = host.querySelector("code");
    expect(pre?.getAttribute("contenteditable")).toBe("true");
    // <code> is not decorated itself; it inherits editability from <pre>.
    expect(code?.getAttribute("contenteditable")).toBeNull();
    expect(code?.isContentEditable).toBe(true);
  });

  it("inserts a literal \\n on Enter inside <pre> without growing <br>/elements (Issue #285)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<pre><code>ab</code></pre>" onChange={vi.fn()} />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    const textNode = requireNode(code?.firstChild);
    expect(textNode.nodeType).toBe(Node.TEXT_NODE);
    // Seed caret between "a" and "b" so we can pin the insertion point.
    const sel = document.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.setEnd(textNode, 1);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      host.dispatchEvent(event);
    });
    await flushMutations();
    expect(event.defaultPrevented).toBe(true);
    expect(host.querySelector("br")).toBeNull();
    expect(host.querySelectorAll("pre")).toHaveLength(1);
    expect(host.querySelectorAll("code")).toHaveLength(1);
    expect(host.querySelector("code")?.textContent).toBe("a\nb");
  });

  it("inserts a literal \\n on Enter inside a bare <pre> with direct text (Issue #285 W-A)", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<pre>ab</pre>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const pre = host.querySelector("pre");
    expect(pre?.getAttribute("contenteditable")).toBe("true");
    const textNode = requireNode(pre?.firstChild);
    expect(textNode.nodeType).toBe(Node.TEXT_NODE);
    // Seed caret between "a" and "b" so we can pin the insertion point.
    const sel = document.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.setEnd(textNode, 1);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      host.dispatchEvent(event);
    });
    await flushMutations();
    expect(event.defaultPrevented).toBe(true);
    expect(host.querySelector("br")).toBeNull();
    expect(host.querySelectorAll("pre")).toHaveLength(1);
    expect(host.querySelector("pre")?.textContent).toBe("a\nb");
  });

  it("clears and re-applies <pre> contentEditable across a disabled toggle (Issue #285 W-B)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<pre><code>foo</code></pre>" onChange={vi.fn()} />,
      );
    });
    const host = findHost();
    expect(host.querySelector("pre")?.getAttribute("contenteditable")).toBe(
      "true",
    );
    // disabled = true: the disabled effect clears the attribute outright.
    await act(async () => {
      root.render(
        <InlineEditor
          value="<pre><code>foo</code></pre>"
          onChange={vi.fn()}
          disabled
        />,
      );
    });
    expect(
      host.querySelector("pre")?.getAttribute("contenteditable"),
    ).toBeNull();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<pre><code>foo</code></pre>"
          onChange={vi.fn()}
          disabled={false}
        />,
      );
    });
    expect(host.querySelector("pre")?.getAttribute("contenteditable")).toBe(
      "true",
    );
  });

  it("emits onChange for characterData edits inside <pre><code> without rollback (Issue #285)", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<pre><code>foo</code></pre>"
          onChange={onChange}
        />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    const textNode = code?.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
    await act(async () => {
      if (textNode !== null && textNode !== undefined) {
        (textNode as Text).textContent = "foobar";
      }
    });
    await flushMutations();
    expect(onChange).toHaveBeenCalled();
    // Not rolled back: the edited text survives and structure is intact.
    expect(host.querySelector("code")?.textContent).toBe("foobar");
    expect(host.querySelectorAll("pre")).toHaveLength(1);
  });

  it("keeps an element inserted inside <pre> in the DOM but strips it from saved HTML (Issue #498)", async () => {
    // A `<pre>` is an
    // opaque region whose decoration spans are allowed in the live DOM
    // (we can't tell highlighter spans from other element churn inside
    // `<pre>`). The saved-HTML guarantee is preserved differently —
    // `serializeHostContent` normalizes every `<pre>` to plain text — so
    // nothing leaks even though the live span survives.
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<pre><code>foo</code></pre>"
          onChange={onChange}
        />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    expect(code).not.toBeNull();
    await act(async () => {
      const extra = document.createElement("span");
      extra.textContent = "x";
      code?.appendChild(extra);
    });
    // Force a text diff so an onChange fires for assertion.
    await act(async () => {
      const firstText = code?.firstChild;
      if (firstText != null) (firstText as Text).textContent = "foobar";
    });
    await flushMutations();
    // Live DOM keeps the span (not rolled back).
    expect(host.querySelector("span")).not.toBeNull();
    // Saved HTML is clean — the span never leaks.
    const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(lastArg).not.toContain("<span");
    expect(lastArg).toContain("<pre><code>");
  });

  it("inserts two spaces on Tab inside <pre> without rollback (Issue #498)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<pre><code>foo</code></pre>" onChange={vi.fn()} />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    const textNode = requireNode(code?.firstChild);
    const sel = document.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 3);
    range.setEnd(textNode, 3);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      host.dispatchEvent(event);
    });
    await flushMutations();
    expect(event.defaultPrevented).toBe(true);
    // Two spaces inserted at the caret; no rollback, no tab character.
    expect(host.querySelector("code")?.textContent).toBe("foo  ");
    expect(host.querySelectorAll("pre")).toHaveLength(1);
  });

  it("removes up to two leading spaces on Shift+Tab inside <pre> (Issue #498)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor
          value="<pre><code>    foo</code></pre>"
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    const textNode = requireNode(code?.firstChild);
    const sel = document.getSelection();
    const range = document.createRange();
    // Caret somewhere on the line (after the leading spaces).
    range.setStart(textNode, 6);
    range.setEnd(textNode, 6);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      host.dispatchEvent(event);
    });
    await flushMutations();
    expect(event.defaultPrevented).toBe(true);
    expect(host.querySelector("code")?.textContent).toBe("  foo");
  });

  it("does not dedent another line on Shift+Tab at offset 0 of a newline-led <pre> (Issue #498)", async () => {
    // The block begins with a newline; the caret sits at offset 0 (the
    // empty first line). Shift+Tab must be a no-op for that line, not strip
    // the indentation of line 2 (the lastIndexOf negative-fromIndex trap).
    await act(async () => {
      root.render(
        <InlineEditor
          value={"<pre><code>\n  foo</code></pre>"}
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    const textNode = requireNode(code?.firstChild);
    const sel = document.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 0);
    sel?.removeAllRanges();
    sel?.addRange(range);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      host.dispatchEvent(event);
    });
    await flushMutations();
    expect(event.defaultPrevented).toBe(true);
    // Line 2's two leading spaces are untouched.
    expect(host.querySelector("code")?.textContent).toBe("\n  foo");
  });

  it("strips highlight <span>s from <pre> in the emitted HTML (Issue #498)", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<pre><code>const</code></pre>"
          onChange={onChange}
        />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    expect(code).not.toBeNull();
    // Simulate the highlighter injecting decoration spans into <pre>.
    await act(async () => {
      const span = document.createElement("span");
      span.className = "shiki-token-keyword";
      span.textContent = "const";
      code?.replaceChildren(span);
    });
    // The span add inside <pre> is allowed (opaque region), so an emit
    // fires. Force a characterData edit to guarantee an onChange.
    await act(async () => {
      const span = host.querySelector("span");
      if (span?.firstChild != null) {
        (span.firstChild as Text).textContent = "constx";
      }
    });
    await flushMutations();
    expect(onChange).toHaveBeenCalled();
    const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    // The saved HTML must be clean — no decoration spans leak.
    expect(lastArg).not.toContain("<span");
    expect(lastArg).not.toContain("shiki-token");
    expect(lastArg).toContain("<pre><code>constx</code></pre>");
    // The live DOM still holds the span (display-only); only serialize
    // normalizes it.
    expect(host.querySelector("span")).not.toBeNull();
  });

  it("strips highlight <span>s from a bare <pre> in the emitted HTML (Issue #498)", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor value="<pre>const</pre>" onChange={onChange} />,
      );
    });
    const host = findHost();
    const pre = host.querySelector("pre");
    expect(pre).not.toBeNull();
    await act(async () => {
      const span = document.createElement("span");
      span.className = "shiki-token-keyword";
      span.textContent = "const";
      pre?.replaceChildren(span);
    });
    await act(async () => {
      const span = host.querySelector("span");
      if (span?.firstChild != null) {
        (span.firstChild as Text).textContent = "constx";
      }
    });
    await flushMutations();
    expect(onChange).toHaveBeenCalled();
    const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastArg).not.toContain("<span");
    expect(lastArg).toContain("<pre>constx</pre>");
  });

  it("does not roll back when a <span> is added inside <pre> (Issue #498)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<pre><code>foo</code></pre>" onChange={vi.fn()} />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    await act(async () => {
      const span = document.createElement("span");
      span.className = "shiki-token-keyword";
      span.textContent = "foo";
      code?.replaceChildren(span);
    });
    await flushMutations();
    // The span inside <pre> survives (opaque region) — not rolled back.
    expect(host.querySelector("span")).not.toBeNull();
    expect(host.querySelector("code")?.textContent).toBe("foo");
  });

  it("does not roll back on compositionend when spans were injected inside <pre> (Issue #498 structureSignature opacity)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<pre><code>foo</code></pre>" onChange={vi.fn()} />,
      );
    });
    const host = findHost();
    const code = host.querySelector("code");
    await act(async () => {
      host.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    });
    // The highlighter injects decoration spans inside <pre> mid-composition.
    await act(async () => {
      const span = document.createElement("span");
      span.className = "shiki-token-keyword";
      span.textContent = "foo";
      code?.replaceChildren(span);
    });
    // compositionend compares structure signatures. Because <pre> is opaque
    // (its descendants are not walked), the span injection must NOT register
    // as drift, so no rollback fires. Were the <pre>-skip removed, the snap
    // signature (plain text) and current signature (span) would diverge and
    // roll the span away — this test guards that regression.
    await act(async () => {
      host.dispatchEvent(new Event("compositionend", { bubbles: true }));
    });
    await flushMutations();
    expect(host.querySelector("span")).not.toBeNull();
    expect(host.querySelector("code")?.textContent).toBe("foo");
  });

  it("still rolls back a <span> added outside <pre> (Issue #498 boundary)", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const p = host.querySelector("p");
    await act(async () => {
      const span = document.createElement("span");
      span.textContent = "x";
      p?.appendChild(span);
    });
    await flushMutations();
    expect(host.querySelector("span")).toBeNull();
    expect(host.querySelector("p")?.textContent).toBe("foo");
  });

  it("blurs the editor on Escape inside <pre> to escape the focus trap (Issue #498)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<pre><code>foo</code></pre>" onChange={vi.fn()} />,
      );
    });
    const host = findHost();
    const pre = host.querySelector("pre");
    const code = host.querySelector("code");
    const textNode = requireNode(code?.firstChild);
    pre?.focus();
    const sel = document.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.setEnd(textNode, 1);
    sel?.removeAllRanges();
    sel?.addRange(range);
    const blurSpy = vi.spyOn(pre as HTMLElement, "blur");

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      host.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(blurSpy).toHaveBeenCalled();
  });

  it("allows childList mutations during IME composition without rollback", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const p = host.querySelector("p");
    expect(p).not.toBeNull();
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
    });
    // Force-append an element while composing — must NOT be rolled back.
    await act(async () => {
      const extra = document.createElement("span");
      extra.textContent = "x";
      p?.appendChild(extra);
    });
    await flushMutations();
    expect(host.querySelector("span")).not.toBeNull();
  });

  it("rolls back on compositionend when the structure drifted from the snapshot", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const p = host.querySelector("p");
    expect(p).not.toBeNull();
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
    });
    await act(async () => {
      const extra = document.createElement("span");
      extra.textContent = "x";
      p?.appendChild(extra);
    });
    // compositionend → structural signature differs from snapshot → rollback.
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      );
    });
    await flushMutations();
    expect(host.querySelector("span")).toBeNull();
    expect(host.querySelector("p")?.textContent).toBe("foo");
  });

  it("resets the composing flag on compositionend so later element appends are rolled back", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
    });
    // No structural drift during composition.
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      );
    });
    await flushMutations();
    // Now (composing flag should be cleared) append an element — rollback.
    const p = host.querySelector("p");
    await act(async () => {
      const extra = document.createElement("span");
      extra.textContent = "x";
      p?.appendChild(extra);
    });
    await flushMutations();
    expect(host.querySelector("span")).toBeNull();
  });

  it("rolls back when a leaf gets a new attribute added", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const p = host.querySelector("p");
    expect(p).not.toBeNull();
    await act(async () => {
      p?.setAttribute("data-foo", "x");
    });
    await flushMutations();
    // Rollback restores the snapshot which had no `data-foo`.
    expect(host.querySelector("p")?.getAttribute("data-foo")).toBeNull();
  });

  it("decorates the <p><img></p> media wrapper, not the <img> itself (Issue #287)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor
          value='<p><img src="/media/abc" alt=""></p>'
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    const p = host.querySelector("p");
    const img = host.querySelector("img");
    expect(p?.getAttribute("contenteditable")).toBe("true");
    expect(img?.getAttribute("contenteditable")).toBeNull();
  });

  it("decorates the media paragraph appended by insertMediaIntoHtml after an external value resync (Issue #287)", async () => {
    // The inline-mode media-insert path: upload → insertMediaIntoHtml
    // string append → dispatch setContent → new `value` prop → resync
    // rebuild. The appended <p><img></p> must come out editable.
    const onChange = vi.fn();
    await act(async () => {
      root.render(<InlineEditor value="<p>hi</p>" onChange={onChange} />);
    });
    const next = insertMediaIntoHtml("<p>hi</p>", { id: "abc" });
    await act(async () => {
      root.render(<InlineEditor value={next} onChange={onChange} />);
    });
    const host = findHost();
    const paragraphs = host.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    const mediaP = paragraphs[1];
    expect(mediaP.querySelector("img")?.getAttribute("src")).toBe("/media/abc");
    expect(mediaP.getAttribute("contenteditable")).toBe("true");
  });

  it("emits the <img> reference plus typed text without rollback or contenteditable leak (Issue #287)", async () => {
    // DOM-level equivalent of placing the caret next to the image and
    // typing: a TEXT_NODE childList addition on a contentEditable
    // target, which the classifier must allow.
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value='<p><img src="/media/abc" alt=""></p>'
          onChange={onChange}
        />,
      );
    });
    const host = findHost();
    const p = requireNode(host.querySelector("p"));
    await act(async () => {
      p.appendChild(document.createTextNode("after"));
    });
    await flushMutations();
    // Not rolled back: the typed text survives beside the image.
    expect(host.querySelector("p")?.textContent).toBe("after");
    expect(host.querySelector("img")).not.toBeNull();
    expect(onChange).toHaveBeenCalled();
    const emitted = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(emitted).toContain('src="/media/abc"');
    expect(emitted).toContain("after");
    // Editor-only attribute must not leak into the emitted HTML.
    expect(emitted).not.toContain("contenteditable");
  });

  it("decorates an empty <p></p> (Issue #287 generalization)", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p></p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    expect(host.querySelector("p")?.getAttribute("contenteditable")).toBe(
      "true",
    );
  });

  it("decorates blocks holding media behind an inline wrapper (Issue #287, ADR-001 option 2)", async () => {
    // The case that made ADR-001 reject a direct-media-child check:
    // the <img> sits behind an inline <a>, so only the general
    // pure-container rule (no editable *block* descendant) decorates
    // the wrapper. <td><img></td> pins the same rule on a table cell.
    await act(async () => {
      root.render(
        <InlineEditor
          value='<p><a href="/x"><img src="/media/abc" alt=""></a></p><table><tbody><tr><td><img src="/media/def" alt=""></td></tr></tbody></table>'
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    expect(host.querySelector("p")?.getAttribute("contenteditable")).toBe(
      "true",
    );
    expect(host.querySelector("td")?.getAttribute("contenteditable")).toBe(
      "true",
    );
    expect(host.querySelector("a")?.getAttribute("contenteditable")).toBeNull();
    for (const img of host.querySelectorAll("img")) {
      expect(img.getAttribute("contenteditable")).toBeNull();
    }
  });

  it("skips a pure container whose editable block sits deeper than one level (Issue #287)", async () => {
    // containsEditableBlock searches descendants at any depth: the
    // outer <blockquote> only holds the <li> via an intermediate
    // <ul>, yet it must still be skipped as a pure container.
    await act(async () => {
      root.render(
        <InlineEditor
          value="<blockquote><ul><li>x</li></ul></blockquote>"
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    expect(
      host.querySelector("blockquote")?.getAttribute("contenteditable"),
    ).toBeNull();
    expect(host.querySelector("li")?.getAttribute("contenteditable")).toBe(
      "true",
    );
  });

  it("rolls back when the <img> is force-removed from its wrapper (Issue #287 structure preservation)", async () => {
    // Element removal is structural drift even inside a decorated
    // block; deleting the image requires switching to html mode.
    await act(async () => {
      root.render(
        <InlineEditor
          value='<p><img src="/media/abc" alt=""></p>'
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    const img = requireNode(host.querySelector("img"));
    await act(async () => {
      img.remove();
    });
    await flushMutations();
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/media/abc");
  });

  it("emits onChange via debounced characterData mutation on leaf text", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={onChange} />);
    });
    const host = findHost();
    const p = host.querySelector("p");
    const textNode = p?.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
    await act(async () => {
      if (textNode !== null && textNode !== undefined) {
        (textNode as Text).textContent = "foobar";
      }
    });
    await flushMutations();
    expect(onChange).toHaveBeenCalled();
    const lastCallArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(typeof lastCallArg).toBe("string");
    expect(lastCallArg).toContain("foobar");
    // The emitted HTML must NOT carry the editor-only contenteditable
    // attribute.
    expect(lastCallArg).not.toContain("contenteditable");
  });

  // Issue #840: the rollback baseline follows the last-known-good DOM, so
  // an out-of-bounds mutation rewinds only its own batch — earlier legit
  // edits since the last rebuild are kept, and the parent `value` is
  // reconciled to the restored DOM even through the debounce window.

  it("keeps a preceding legit edit when a later batch rolls back (Issue #840 snapshot follow / TC-005)", async () => {
    // <p>before<img>after</p>: append TAIL to the trailing text (allowed →
    // snapshot advances), then force-remove the <img> (rollback). The
    // rollback must rewind only the <img> removal, keeping TAIL.
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value='<p>before<img src="/media/abc" alt="">after</p>'
          onChange={onChange}
        />,
      );
    });
    const host = findHost();
    const p = requireNode(host.querySelector("p"));
    const tailText = requireNode(p.lastChild);
    expect(tailText.nodeType).toBe(Node.TEXT_NODE);
    // Legit edit E1 (characterData): "after" → "afterTAIL".
    await act(async () => {
      (tailText as Text).textContent = "afterTAIL";
    });
    await flushMutations();
    // Now remove the <img> in a separate batch → rollback of that batch.
    const img = requireNode(host.querySelector("img"));
    await act(async () => {
      img.remove();
    });
    await flushMutations();
    // <img> restored AND the preceding TAIL edit survives (not rewound to
    // the initial rebuild snapshot).
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/media/abc");
    expect(host.querySelector("p")?.textContent).toContain("TAIL");
  });

  it("does not silently overwrite a saved sibling block when another block rolls back (Issue #840 / TC-007)", async () => {
    // Two paragraphs; edit each with a debounce flush between so each edit
    // reaches autosave (onChange). Then trip a rollback in a third element
    // and confirm (1) the earlier blocks survive in the DOM and (2) a
    // later emit does not carry the pre-edit body.
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<p>aaa</p><p>bbb</p><table><tbody><tr><td>c1</td><td>c2</td></tr></tbody></table>"
          onChange={onChange}
        />,
      );
    });
    const host = findHost();
    const paragraphs = host.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    // Edit block A, flush to autosave.
    await act(async () => {
      (requireNode(paragraphs[0].firstChild) as Text).textContent = "aaaEDIT";
    });
    await flushMutations();
    // Edit block B, flush to autosave.
    await act(async () => {
      (requireNode(paragraphs[1].firstChild) as Text).textContent = "bbbEDIT";
    });
    await flushMutations();

    // Trip a rollback: force-remove a <td> (structural drift).
    const tr = requireNode(host.querySelector("tr"));
    await act(async () => {
      tr.removeChild(requireNode(tr.firstChild));
    });
    await flushMutations();

    // (1) DOM keeps the preceding legit edits — no drag-along loss.
    expect(host.querySelectorAll("td")).toHaveLength(2);
    expect(host.querySelector("p")?.textContent).toBe("aaaEDIT");

    // (2) A later edit → emit must carry the up-to-date body (aaaEDIT),
    // not the pre-edit "aaa" — i.e. no silent overwrite-save of stale
    // content.
    const nextParagraphs = host.querySelectorAll("p");
    await act(async () => {
      (requireNode(nextParagraphs[1].firstChild) as Text).textContent =
        "bbbEDIT2";
    });
    await flushMutations();
    const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastArg).toContain("aaaEDIT");
    expect(lastArg).toContain("bbbEDIT2");
  });

  it("reconciles the parent value on rollback when a captured edit is still debounce-pending (Issue #840 P-001)", async () => {
    // The debounce window: a legit edit E1 is captured into the snapshot
    // but its 50ms emit has NOT fired when a rollback trips. Without
    // reconciliation the restored DOM keeps E1 but the parent `value`
    // never receives it (the pending emit early-returns). E1 and the
    // rollback trigger must be in SEPARATE observer batches — else the
    // whole batch is a rollback and E1 never gets captured.
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value='<p>seed</p><p><img src="/media/abc" alt=""></p>'
          onChange={onChange}
        />,
      );
    });
    const host = findHost();
    const firstP = requireNode(host.querySelector("p"));
    // (Step A) E1 in its own act → observer captures it as an allowed
    // batch and schedules the 50ms emit. `act` does not advance real time,
    // so the debounce stays pending (no 80ms flush here).
    await act(async () => {
      (requireNode(firstP.firstChild) as Text).textContent = "seedEDIT";
    });
    // No debounced emit yet (window not elapsed).
    expect(onChange).not.toHaveBeenCalled();

    // (Step B) In a separate act — with NO 80ms flush between — trip a
    // rollback by removing the <img>.
    const img = requireNode(host.querySelector("img"));
    await act(async () => {
      img.remove();
    });
    await flushMutations();

    // (1) E1 survives in the DOM.
    expect(host.querySelector("p")?.textContent).toBe("seedEDIT");
    expect(host.querySelector("img")).not.toBeNull();
    // (2) The rollback reconciled the parent: onChange fired synchronously
    // with the restored DOM including E1.
    expect(onChange).toHaveBeenCalled();
    const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastArg).toContain("seedEDIT");
    expect(lastArg).toContain('src="/media/abc"');
  });

  it("keeps a typed character in an empty <td> by allowing the placeholder <br> removal (Issue #840 candidate C / AC-4)", async () => {
    await act(async () => {
      root.render(
        <InlineEditor
          value="<table><tbody><tr><td><br></td></tr></tbody></table>"
          onChange={vi.fn()}
        />,
      );
    });
    const host = findHost();
    const td = requireNode(host.querySelector("td"));
    // Browser behaviour on first keystroke into an empty editable block:
    // insert the text node, remove the placeholder <br>, in one batch.
    await act(async () => {
      td.replaceChildren(document.createTextNode("X"));
    });
    await flushMutations();
    // Not rolled back: the character stays.
    expect(host.querySelector("td")?.textContent).toBe("X");
    expect(host.querySelector("br")).toBeNull();
  });

  it("keeps a typed character in an empty <p> by allowing the placeholder <br> removal (Issue #840 candidate C / AC-4)", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p><br></p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const p = requireNode(host.querySelector("p"));
    await act(async () => {
      p.replaceChildren(document.createTextNode("X"));
    });
    await flushMutations();
    expect(host.querySelector("p")?.textContent).toBe("X");
    expect(host.querySelector("br")).toBeNull();
  });

  it("still rolls back a <strong> removal, an <img> removal, and a <br> removal that leaves an element child (Issue #840 AC-5 / candidate C guard)", async () => {
    // (a) <strong> removal.
    await act(async () => {
      root.render(
        <InlineEditor value="<p>a<strong>b</strong>c</p>" onChange={vi.fn()} />,
      );
    });
    let host = findHost();
    const strong = requireNode(host.querySelector("strong"));
    await act(async () => {
      strong.remove();
    });
    await flushMutations();
    expect(host.querySelector("strong")?.textContent).toBe("b");

    // (b) <img> removal — covered by the existing #287 pin too; re-pinned
    // here under the follow-snapshot regime.
    await act(async () => {
      root.render(
        <InlineEditor
          value='<p><img src="/media/abc" alt=""></p>'
          onChange={vi.fn()}
        />,
      );
    });
    host = findHost();
    const img = requireNode(host.querySelector("img"));
    await act(async () => {
      img.remove();
    });
    await flushMutations();
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/media/abc");

    // (c) <br> removal in a block that still holds an element child
    // (`querySelector("*") !== null`) — the placeholder allowance must NOT
    // apply. Built with an <img> sibling so removing the <br> leaves an
    // element behind (a 2-text-run <p>a<br>b</p> would pass the guard and
    // is intentionally not used — arch-risk S-001).
    await act(async () => {
      root.render(
        <InlineEditor
          value='<p>a<br><img src="/media/def" alt=""></p>'
          onChange={vi.fn()}
        />,
      );
    });
    host = findHost();
    const br = requireNode(host.querySelector("br"));
    await act(async () => {
      br.remove();
    });
    await flushMutations();
    // Rolled back: the <br> is restored (and the <img> stays).
    expect(host.querySelector("br")).not.toBeNull();
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/media/def");
  });

  it("still rolls back on compositionend after the snapshot advanced on a prior legit edit (Issue #840 AC-6)", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={onChange} />);
    });
    const host = findHost();
    const p = requireNode(host.querySelector("p"));
    // A non-composing allowed edit advances the snapshot.
    await act(async () => {
      (requireNode(p.firstChild) as Text).textContent = "foobar";
    });
    await flushMutations();
    // Now compose and drift the structure → compositionend must still roll
    // back (snapshot follow did NOT disable drift detection).
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
    });
    await act(async () => {
      const extra = document.createElement("span");
      extra.textContent = "x";
      p.appendChild(extra);
    });
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      );
    });
    await flushMutations();
    expect(host.querySelector("span")).toBeNull();
    // Rolled back to the last-known-good DOM (which includes the earlier
    // "foobar" edit, not the initial "foo").
    expect(host.querySelector("p")?.textContent).toBe("foobar");
  });

  it("does not fold text typed mid-composition into the snapshot, so a compositionend drift rewinds it (Issue #840 AC-6 / capture guard)", async () => {
    // The capture guard skips snapshot advance while composing. If it were
    // removed, mid-composition text would be folded into the baseline and
    // survive the drift rollback. Behaviour pin (the guard is a private
    // closure): a characterData edit made during composition must be
    // rewound by the compositionend drift rollback.
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const p = requireNode(host.querySelector("p"));
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
    });
    // characterData edit while composing (allowed, but must NOT advance
    // the snapshot).
    await act(async () => {
      (requireNode(p.firstChild) as Text).textContent = "fooDURING";
    });
    // Structural drift while composing.
    await act(async () => {
      const extra = document.createElement("span");
      extra.textContent = "x";
      p.appendChild(extra);
    });
    // compositionend → drift vs snapshot → rollback to "foo".
    await act(async () => {
      host.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      );
    });
    await flushMutations();
    expect(host.querySelector("span")).toBeNull();
    // Mid-composition text was NOT folded into the baseline, so it is gone.
    expect(host.querySelector("p")?.textContent).toBe("foo");
  });

  it("restores a plain <pre> (no highlight spans) after a rollback and reconciles onChange (Issue #840 AC-7)", async () => {
    // The snapshot captures <pre> as plain text (cleanClone flattens it),
    // so a rollback restores a span-free <pre>, and the reconciled
    // onChange argument is likewise plain. To make onChange observable the
    // <pre> text must actually change before the rollback (else cleanClone
    // flattening keeps serialize == lastEmitted and reconciliation stays
    // silent — arch-risk S-001).
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <InlineEditor
          value="<p>seed</p><pre><code>foo</code></pre>"
          onChange={onChange}
        />,
      );
    });
    const host = findHost();
    const code = requireNode(host.querySelector("code"));
    // Allowed batch inside <pre>: change the text and inject a highlight
    // span (opaque region → allowed, snapshot advances with plain <pre>).
    await act(async () => {
      const span = document.createElement("span");
      span.className = "shiki-token-keyword";
      span.textContent = "foobar";
      code.replaceChildren(span);
    });
    await flushMutations();
    expect(host.querySelector("span")).not.toBeNull();

    // Trip a rollback elsewhere (remove the <p>'s text into structural
    // drift by appending a stray element).
    const p = requireNode(host.querySelector("p"));
    await act(async () => {
      const stray = document.createElement("b");
      stray.textContent = "x";
      p.appendChild(stray);
    });
    await flushMutations();

    // Restored DOM: <pre> is plain (no highlight span leaked into the
    // baseline).
    const restoredPre = requireNode(host.querySelector("pre"));
    expect(restoredPre.querySelector("span")).toBeNull();
    expect(host.querySelector("code")?.textContent).toBe("foobar");
    // The reconciled onChange argument is also span-free plain <pre>.
    const lastArg = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastArg).not.toContain("<span");
    expect(lastArg).toContain("<pre><code>foobar</code></pre>");
  });
});
