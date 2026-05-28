// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineEditor } from "@/components/note/editor/InlineEditor";

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
    let prevented = false;
    host.addEventListener(
      "keydown",
      () => {
        prevented = event.defaultPrevented;
      },
      { capture: false },
    );
    host.dispatchEvent(event);
    expect(prevented).toBe(true);
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
});
