// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WysiwygEditor } from "@/components/note/editor/WysiwygEditor";

/**
 * Issue #9 regression for the TC-008 observation: the TipTap initial
 * parse-normalisation tick used to fire `onUpdate` even though the user
 * had not typed, which routed through autosave and silently rewrote
 * `state.contentHtml`. The `lastEmittedHtmlRef` guard in
 * `WysiwygEditor.tsx` is what now prevents that — these tests pin the
 * guard in place so a future refactor cannot drop it without an alarm.
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

describe("WysiwygEditor onChange suppression", () => {
  it("does not call onChange on initial mount", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>hello</p>"
          onChange={onChange}
          disabled={false}
        />,
      );
    });
    // Allow TipTap's deferred mount + initial parse to settle.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange when value prop changes externally", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>first</p>"
          onChange={onChange}
          disabled={false}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>second</p>"
          onChange={onChange}
          disabled={false}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
