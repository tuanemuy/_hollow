// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorModeSwitch } from "../EditorModeSwitch";
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
 * Scope note (review-001 W-002): this file only pins the *tab inventory*.
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

function renderSwitch(surface: EditorSurface, mode: EditorMode): void {
  act(() => {
    root.render(
      <EditorModeSwitch surface={surface} mode={mode} onChange={() => {}} />,
    );
  });
}

function tabLabels(): string[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ).map((b) => b.textContent?.trim() ?? "");
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
