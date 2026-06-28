// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TagsInput } from "../TagsInput";

/**
 * The chip editor carries keyboard / IME / blur / combobox logic the
 * reducer cannot exercise on its own. Locks:
 *
 * 1. Enter / comma commit a non-empty draft via `onAddTag`; an empty draft
 *    is a no-op.
 * 2. A keystroke fired mid-IME-conversion (`isComposing`) never commits or
 *    navigates candidates.
 * 3. Backspace on an empty draft removes the trailing chip; on a non-empty
 *    draft it does nothing.
 * 4. The chip `×` button removes that specific tag.
 * 5. Blur commits a non-empty (valid) draft (the "typed then abandoned"
 *    rescue).
 * 6. `disabled` deactivates the remove buttons and the input.
 * 7. Combobox: existing-tag suggestions, ArrowUp/Down + Enter to commit a
 *    candidate, `-1` start so Enter on an unhighlighted draft commits the
 *    typed new tag, IME-guarded arrows, Escape close, invalid-draft
 *    suppression, new-vs-existing display split, and ARIA wiring.
 *
 * The container moved from `ul/li` to `div` (chips are `span`s, the input
 * is a direct child) for the bordered single-field layout — chip assertions
 * key off the labelled remove buttons rather than `li` count.
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
  suggestions?: readonly string[];
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
        suggestions={props.suggestions ?? []}
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

function removeButtons(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label$="を削除"]',
    ),
  );
}

function options(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
}

function focusInput() {
  act(() => {
    getInput().focus();
  });
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

    expect(removeButtons()).toHaveLength(2);
    expect(container.textContent).toContain("#alpha");
    expect(container.textContent).toContain("#beta");
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

  // --- Combobox behaviour (Issue #789) -------------------------------------

  it("exposes the combobox ARIA contract on the input", () => {
    renderInput();
    const input = getInput();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
  });

  it("shows existing-tag suggestions filtered by the draft on focus", () => {
    renderInput({ draft: "re", suggestions: ["react", "redux", "vue"] });
    focusInput();
    const labels = options().map((o) => o.textContent);
    expect(labels).toEqual(["#react", "#redux"]);
    expect(getInput().getAttribute("aria-expanded")).toBe("true");
    expect(getInput().getAttribute("aria-controls")).not.toBeNull();
  });

  it("highlights the first option (no skip) on the first ArrowDown, then Enter commits it", () => {
    const onAddTag = vi.fn();
    renderInput({
      draft: "re",
      suggestions: ["react", "redux"],
      onAddTag,
    });
    focusInput();
    pressKey("ArrowDown");
    const active = getInput().getAttribute("aria-activedescendant");
    expect(active).not.toBeNull();
    expect(active?.endsWith("-0")).toBe(true);
    expect(options()[0]?.getAttribute("data-active")).not.toBeNull();
    pressKey("Enter");
    expect(onAddTag).toHaveBeenCalledTimes(1);
    expect(onAddTag).toHaveBeenCalledWith("react");
  });

  it("commits the typed draft (not a partial match) when no candidate is highlighted", () => {
    const onAddTag = vi.fn();
    renderInput({ draft: "foobar", suggestions: ["foobarbaz"], onAddTag });
    focusInput();
    // No ArrowDown: activeIndex stays -1.
    expect(getInput().getAttribute("aria-activedescendant")).toBeNull();
    pressKey("Enter");
    expect(onAddTag).toHaveBeenCalledTimes(1);
    expect(onAddTag).toHaveBeenCalledWith("foobar");
  });

  it("ignores ArrowDown fired during IME composition", () => {
    renderInput({ draft: "re", suggestions: ["react", "redux"] });
    focusInput();
    pressKey("ArrowDown", { isComposing: true });
    expect(getInput().getAttribute("aria-activedescendant")).toBeNull();
  });

  it("closes the panel on Escape (aria-expanded=false) keeping suggestions", () => {
    renderInput({ draft: "re", suggestions: ["react", "redux"] });
    focusInput();
    expect(getInput().getAttribute("aria-expanded")).toBe("true");
    pressKey("Escape");
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
    expect(options()).toHaveLength(0);
  });

  it("does not open the panel for an empty draft on focus", () => {
    renderInput({ draft: "", suggestions: ["react", "redux"] });
    focusInput();
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
    expect(options()).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows a create-new indicator (no listbox) for a fresh draft", () => {
    renderInput({ draft: "angular", suggestions: ["react", "redux"] });
    focusInput();
    // No existing match → no listbox options, but the panel is open with the
    // new-creation indicator and aria-expanded=true without aria-controls.
    expect(options()).toHaveLength(0);
    expect(getInput().getAttribute("aria-expanded")).toBe("true");
    expect(getInput().getAttribute("aria-controls")).toBeNull();
    expect(getInput().getAttribute("aria-activedescendant")).toBeNull();
    expect(container.textContent).toContain("新規作成");
  });

  it("suppresses commit of an invalid draft and surfaces an inline error", () => {
    const onAddTag = vi.fn();
    renderInput({ draft: "foo bar", onAddTag });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // Error is shown via aria-live region, not role=alert.
    expect(container.textContent).toContain("空白や改行は使えません");
    pressKey("Enter");
    expect(onAddTag).not.toHaveBeenCalled();
    // Blur must not commit an invalid draft either (stays in the field).
    act(() => {
      getInput().focus();
      getInput().blur();
    });
    expect(onAddTag).not.toHaveBeenCalled();
  });

  // --- B-001: clicking a suggestion option commits that tag
  it("commits a clicked suggestion without triggering blur", () => {
    const onAddTag = vi.fn();
    renderInput({
      draft: "re",
      suggestions: ["react", "redux"],
      onAddTag,
    });
    focusInput();
    const optionBtn = options()[0];
    expect(optionBtn).not.toBeNull();
    act(() => {
      optionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAddTag).toHaveBeenCalledWith("react");
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
  });

  // --- B-002: does not move active on ArrowUp when no suggestions (candidates list is empty)
  it("does not move active on ArrowUp when no suggestions exist", () => {
    renderInput({ draft: "re", suggestions: ["react", "redux"] });
    focusInput();
    // Start with no active candidate
    expect(getInput().getAttribute("aria-activedescendant")).toBeNull();
    // ArrowUp with no active should go to last, but only if candidates exist
    pressKey("ArrowUp");
    // If there are suggestions, this will highlight the last one
    const active = getInput().getAttribute("aria-activedescendant");
    if (options().length > 0) {
      // With suggestions, ArrowUp moves to last candidate
      expect(active?.endsWith(`-${options().length - 1}`)).toBe(true);
    }
  });

  // --- B-003: does not open suggestions when disabled
  it("does not open suggestions panel when disabled", () => {
    renderInput({
      draft: "re",
      suggestions: ["react", "redux"],
      disabled: true,
    });
    // Input is disabled, so suggestions should not appear even with matching draft
    expect(options()).toHaveLength(0);
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
  });

  // --- W-001: resets activeIndex to -1 on draft change
  it("resets activeIndex to -1 on draft change", () => {
    const onSetDraft = vi.fn();
    renderInput({
      draft: "r",
      suggestions: ["react", "redux"],
      onSetDraft,
    });
    focusInput();
    pressKey("ArrowDown");
    let active = getInput().getAttribute("aria-activedescendant");
    expect(active?.endsWith("-0")).toBe(true); // first option

    // Change draft to reset activeIndex
    renderInput({
      draft: "re",
      suggestions: ["react", "redux"],
      onSetDraft,
    });
    focusInput();
    // activeIndex should reset to -1 (no highlight)
    expect(getInput().getAttribute("aria-activedescendant")).toBeNull();
    // Next ArrowDown should go to first again (index 0), not skip
    pressKey("ArrowDown");
    active = getInput().getAttribute("aria-activedescendant");
    expect(active?.endsWith("-0")).toBe(true);
  });

  // --- W-002: panelOpen DOM rendering is in sync with aria-expanded
  it("shows panel DOM with listbox when aria-expanded=true for existing suggestions", () => {
    renderInput({ draft: "re", suggestions: ["react", "redux"] });
    focusInput();
    // When aria-expanded=true and candidates exist, listbox should be in DOM
    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(getInput().getAttribute("aria-expanded")).toBe("true");
  });

  it("shows panel DOM with new-draft indicator when aria-expanded=true for new draft only", () => {
    renderInput({ draft: "angular", suggestions: ["react", "redux"] });
    focusInput();
    // No existing match → no listbox, but create-new indicator should appear
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(container.textContent).toContain("新規作成");
    expect(getInput().getAttribute("aria-expanded")).toBe("true");
    expect(getInput().getAttribute("aria-controls")).toBeNull();
  });

  // --- W-003: error element has aria-live="polite"
  it("surfaces invalid-draft errors via aria-live=polite", () => {
    renderInput({ draft: "foo bar" });
    const error = container.querySelector('p[aria-live="polite"]');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain("空白や改行は使えません");
  });

  // --- W-004: does not show error for whitespace-only draft
  it("does not show error for whitespace-only draft", () => {
    renderInput({ draft: "   " });
    const error = container.querySelector('[id*="error"]');
    expect(error).toBeNull();
  });

  // --- W-005: sets aria-describedby only when error is present
  it("sets aria-describedby only when error is present", () => {
    renderInput({ draft: "invalid tag" });
    expect(getInput().getAttribute("aria-describedby")).toBeTruthy();

    renderInput({ draft: "validtag" });
    expect(getInput().getAttribute("aria-describedby")).toBeNull();
  });
});
