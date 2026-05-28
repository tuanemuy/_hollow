// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineEditor } from "@/components/note/editor/InlineEditor";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Issue #233: pins the structural-preservation contract of the inline
 * editor.
 *
 * - Editable allow-list applied only to text-bearing block elements.
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
    await act(async () => {
      tr?.removeChild(tr.firstChild!);
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
    // Place caret inside the <p>.
    const sel = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(p!);
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
    // <p> at the caret (W-T-007 / W-T-012). Pinning the insertion
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

  it("does not decorate <pre> or <code> inside <pre><code>x</code></pre>", async () => {
    await act(async () => {
      root.render(
        <InlineEditor value="<pre><code>x</code></pre>" onChange={vi.fn()} />,
      );
    });
    const host = findHost();
    const pre = host.querySelector("pre");
    const code = host.querySelector("code");
    expect(pre?.getAttribute("contenteditable")).toBeNull();
    expect(code?.getAttribute("contenteditable")).toBeNull();
  });

  it("allows childList mutations during IME composition without rollback", async () => {
    await act(async () => {
      root.render(<InlineEditor value="<p>foo</p>" onChange={vi.fn()} />);
    });
    const host = findHost();
    const p = host.querySelector("p");
    expect(p).not.toBeNull();
    // Start composition.
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
    // attribute (W-F-003).
    expect(lastCallArg).not.toContain("contenteditable");
  });
});
