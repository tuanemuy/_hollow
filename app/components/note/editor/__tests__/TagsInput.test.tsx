// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TagsInput } from "../TagsInput";

/**
 * The chip editor carries keyboard / IME /
 * blur logic the reducer cannot exercise on its own. Locks:
 *
 * 1. Enter / comma commit a non-empty draft via `onAddTag`; an empty draft
 *    is a no-op.
 * 2. A keystroke fired mid-IME-conversion (`isComposing`) never commits.
 * 3. Backspace on an empty draft removes the trailing chip; on a non-empty
 *    draft it does nothing.
 * 4. The chip `×` button removes that specific tag.
 * 5. Blur commits a non-empty draft (the "typed then abandoned" rescue).
 * 6. `disabled` deactivates the remove buttons and the input.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

type RenderProps = {
  tagNames?: readonly string[];
  draft?: string;
  onAddTag?: (value: string) => void;
  onRemoveTag?: (name: string) => void;
  onSetDraft?: (value: string) => void;
  disabled?: boolean;
};

function renderInput(props: RenderProps = {}) {
  act(() => {
    root.render(
      <TagsInput
        tagNames={props.tagNames ?? []}
        draft={props.draft ?? ""}
        onAddTag={props.onAddTag ?? (() => {})}
        onRemoveTag={props.onRemoveTag ?? (() => {})}
        onSetDraft={props.onSetDraft ?? (() => {})}
        {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
      />,
    );
  });
}

function getInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="新規タグ"]',
  );
  if (input === null) throw new Error("tags input not rendered");
  return input;
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    getInput().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  });
}

describe("TagsInput", () => {
  it("renders a chip per tag with a labelled remove button and a trailing input", () => {
    renderInput({ tagNames: ["alpha", "beta"] });

    const items = Array.from(container.querySelectorAll("li"));
    // Two chips plus the trailing input <li>.
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("#alpha");
    expect(items[1]?.textContent).toContain("#beta");
    expect(
      container.querySelector('button[aria-label="alpha を削除"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="beta を削除"]'),
    ).not.toBeNull();
    expect(getInput()).not.toBeNull();
  });

  it("commits the draft via Enter", () => {
    const onAddTag = vi.fn();
    renderInput({ draft: "alpha", onAddTag });
    pressKey("Enter");
    expect(onAddTag).toHaveBeenCalledTimes(1);
    expect(onAddTag).toHaveBeenCalledWith("alpha");
  });

  it("commits the draft via comma", () => {
    const onAddTag = vi.fn();
    renderInput({ draft: "alpha", onAddTag });
    pressKey(",");
    expect(onAddTag).toHaveBeenCalledTimes(1);
    expect(onAddTag).toHaveBeenCalledWith("alpha");
  });

  it("does not commit an empty / whitespace-only draft", () => {
    const onAddTag = vi.fn();
    renderInput({ draft: "   ", onAddTag });
    pressKey("Enter");
    pressKey(",");
    expect(onAddTag).not.toHaveBeenCalled();
  });

  it("ignores Enter fired during IME composition", () => {
    const onAddTag = vi.fn();
    renderInput({ draft: "あ", onAddTag });
    pressKey("Enter", { isComposing: true });
    expect(onAddTag).not.toHaveBeenCalled();
  });

  it("removes the last chip on Backspace when the draft is empty", () => {
    const onRemoveTag = vi.fn();
    renderInput({ tagNames: ["alpha", "beta"], draft: "", onRemoveTag });
    pressKey("Backspace");
    expect(onRemoveTag).toHaveBeenCalledTimes(1);
    expect(onRemoveTag).toHaveBeenCalledWith("beta");
  });

  it("does not remove a chip on Backspace when the draft is non-empty", () => {
    const onRemoveTag = vi.fn();
    renderInput({ tagNames: ["alpha"], draft: "x", onRemoveTag });
    pressKey("Backspace");
    expect(onRemoveTag).not.toHaveBeenCalled();
  });

  it("removes the clicked tag via its × button", () => {
    const onRemoveTag = vi.fn();
    renderInput({ tagNames: ["alpha", "beta"], onRemoveTag });
    const btn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="alpha を削除"]',
    );
    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRemoveTag).toHaveBeenCalledTimes(1);
    expect(onRemoveTag).toHaveBeenCalledWith("alpha");
  });

  it("commits a non-empty draft on blur", () => {
    const onAddTag = vi.fn();
    renderInput({ draft: "alpha", onAddTag });
    act(() => {
      getInput().focus();
      getInput().blur();
    });
    expect(onAddTag).toHaveBeenCalledTimes(1);
    expect(onAddTag).toHaveBeenCalledWith("alpha");
  });

  it("does not commit an empty draft on blur", () => {
    const onAddTag = vi.fn();
    renderInput({ draft: "  ", onAddTag });
    act(() => {
      getInput().focus();
      getInput().blur();
    });
    expect(onAddTag).not.toHaveBeenCalled();
  });

  it("disables the remove buttons and the input when disabled", () => {
    renderInput({ tagNames: ["alpha"], disabled: true });
    expect(getInput().disabled).toBe(true);
    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="alpha を削除"]',
    );
    expect(remove?.disabled).toBe(true);
  });
});
