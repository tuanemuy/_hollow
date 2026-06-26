// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EDITOR_BODY_PANEL_ID,
  EditorModeSwitch,
  editorModeTabId,
} from "../EditorModeSwitch";
import type { EditorMode, EditorSurface } from "../editorState";

/**
 * Issue #696: the `edit` surface gains a WYSIWYG tab (AC-1) while the
 * `new` surface tab set stays untouched (AC-6). `EditorModeSwitch` is a
 * pure tab control, so the tab inventory is asserted directly here.
 *
 * Issue #697: the FrontMatter tab is removed from both surfaces — its
 * editor is now permanently mounted below the body editor rather than
 * being a body-content mode. The WYSIWYG tab stays (it is #696's, not
 * #697's). Expected inventories below drop FrontMatter accordingly.
 *
 * Scope: this file only pins the *tab inventory*.
 * The new-surface *switching flow* (that WYSIWYG selection on the new
 * surface never triggers the decoration-loss dialog) is pinned at the
 * orchestrator level in `noteEditorModeChange.test.tsx`
 * ("NoteEditor new surface switching is unchanged"), because the gate
 * lives in `NoteEditor.onModeChange`, not in this pure component.
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

function renderSwitch(
  surface: EditorSurface,
  mode: EditorMode,
  onChange: (mode: EditorMode) => void = () => {},
): void {
  act(() => {
    root.render(
      <EditorModeSwitch surface={surface} mode={mode} onChange={onChange} />,
    );
  });
}

function tabEls(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  );
}

function tabLabels(): string[] {
  return tabEls().map((b) => b.textContent?.trim() ?? "");
}

function pressKey(key: string): void {
  const list = container.querySelector('[role="tablist"]');
  act(() => {
    list?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("EditorModeSwitch tab inventory (Issue #696)", () => {
  it("renders the WYSIWYG tab on the edit surface in the fixed order (AC-1/ADR-003)", () => {
    renderSwitch("edit", "inline");
    // ビジュアル (inline) stays first so the default edit mode keeps its
    // tab position; WYSIWYG follows it.
    expect(tabLabels()).toEqual(["ビジュアル", "WYSIWYG", "HTML"]);
  });

  it("leaves the new surface tab set unchanged (AC-6)", () => {
    renderSwitch("new", "wysiwyg");
    expect(tabLabels()).toEqual(["WYSIWYG", "HTML"]);
  });
});

/**
 * Issue #776: EditorModeSwitch is completed as an APG Tabs control with
 * MANUAL activation. The Tabs roles are kept (it owns a real tabpanel, unlike
 * the radiogroup-shaped display/sort segmented controls); each tab gains a
 * stable `id` + `aria-controls` pointing at the single editor-body tabpanel.
 * Manual activation means arrows move focus only — they never select, so the
 * unsaved / decoration-loss confirm gates (owned by `NoteEditor.onChange`) are
 * never tripped by keyboard traversal. Activation stays the native click.
 */
describe("EditorModeSwitch APG Tabs contract (Issue #776)", () => {
  it("keeps the Tabs roles and wires aria-controls / id to the body panel", () => {
    renderSwitch("edit", "inline");
    const list = container.querySelector('[role="tablist"]');
    expect(list).not.toBeNull();
    expect(list?.getAttribute("aria-label")).toBe("編集モード");
    expect(list?.getAttribute("aria-orientation")).toBe("horizontal");

    const tabs = tabEls();
    // Tabs are kept (not radio) because a real tabpanel exists (ADR-002).
    expect(tabs.map((t) => t.getAttribute("role"))).toEqual([
      "tab",
      "tab",
      "tab",
    ]);
    // Each tab points at the single body panel; ids follow the shared helper.
    for (const tab of tabs) {
      expect(tab.getAttribute("aria-controls")).toBe(EDITOR_BODY_PANEL_ID);
    }
    expect(tabs.map((t) => t.id)).toEqual([
      editorModeTabId("inline"),
      editorModeTabId("wysiwyg"),
      editorModeTabId("html"),
    ]);
    // aria-selected reflects the active mode prop.
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
  });

  it("initial roving tabindex is on the selected tab (focusedIndex === selectedIndex)", () => {
    renderSwitch("edit", "wysiwyg");
    const tabs = tabEls();
    // wysiwyg is index 1 on the edit surface; it is the single tabbable tab.
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("arrow keys move focus only — no selection, no onChange (manual activation)", () => {
    const onChange = vi.fn();
    renderSwitch("edit", "inline", onChange);

    // Initial state: inline is selected
    const tabs = tabEls();
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);

    pressKey("ArrowRight");

    // Focus (and roving tabindex) moved to WYSIWYG, but the selection
    // (aria-selected) is unchanged and onChange was NOT called.
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    // aria-selected is explicitly unchanged after arrow.
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowLeft moves focus to the previous tab (manual)", () => {
    const onChange = vi.fn();
    renderSwitch("edit", "wysiwyg", onChange);

    pressKey("ArrowLeft");

    const tabs = tabEls();
    // Focus moved to inline (index 0, previous from wysiwyg at index 1),
    // but aria-selected and onChange unchanged.
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowLeft from the first tab wraps to the last (manual)", () => {
    const onChange = vi.fn();
    renderSwitch("edit", "inline", onChange);

    pressKey("ArrowLeft");

    const tabs = tabEls();
    // Focus wrapped to HTML (index 2, last), aria-selected unchanged.
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("consecutive arrow presses move focus multiple steps without selecting (manual)", () => {
    const onChange = vi.fn();
    renderSwitch("edit", "inline", onChange);

    pressKey("ArrowRight");
    pressKey("ArrowRight");

    const tabs = tabEls();
    // Focus moved through WYSIWYG (index 1) to HTML (index 2),
    // but aria-selected and onChange remained unchanged throughout.
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Home / End move focus across the rail without selecting (manual)", () => {
    const onChange = vi.fn();
    renderSwitch("edit", "inline", onChange);

    pressKey("End");
    expect(document.activeElement).toBe(tabEls()[2]);
    pressKey("Home");
    expect(document.activeElement).toBe(tabEls()[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowDown behaves like ArrowRight: moves focus without selecting", () => {
    const onChange = vi.fn();
    renderSwitch("edit", "inline", onChange);

    pressKey("ArrowDown");

    const tabs = tabEls();
    expect(document.activeElement).toBe(tabs[1]); // WYSIWYG
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowUp behaves like ArrowLeft: from first wraps to last without selecting", () => {
    const onChange = vi.fn();
    renderSwitch("edit", "inline", onChange);

    pressKey("ArrowUp");

    const tabs = tabEls();
    expect(document.activeElement).toBe(tabs[2]); // HTML (last, wrapped)
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("click activates the tab (onChange fires)", () => {
    const onChange = vi.fn();
    renderSwitch("edit", "inline", onChange);
    act(() => {
      tabEls()[2]?.click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("html");
  });

  it("does not preventDefault on unhandled keys, leaving Tab to move focus away", () => {
    renderSwitch("edit", "inline");
    const list = container.querySelector('[role="tablist"]');
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    act(() => {
      list?.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });
});
