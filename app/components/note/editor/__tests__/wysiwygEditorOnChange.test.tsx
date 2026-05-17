// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WysiwygEditor } from "@/components/note/editor/WysiwygEditor";

/**
 * Issue #9 regression for the TC-008 observation: the TipTap initial
 * parse-normalisation tick used to fire `onUpdate` even though the user
 * had not typed, which routed through autosave and silently rewrote
 * `state.contentHtml`. The `lastEmittedHtmlRef` guard plus the
 * `onCreate` seeding in `WysiwygEditor.tsx` is what now prevents that
 * — these tests pin both in place so a future refactor cannot drop
 * them without an alarm.
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

/**
 * Flush two animation frames so TipTap's `immediatelyRender: false`
 * deferred mount has completed before assertions run. Two frames is
 * enough in happy-dom because `requestAnimationFrame` defers to a
 * microtask; depending on a single fixed `setTimeout` makes the test
 * sensitive to CI scheduling jitter.
 */
async function flushTipTapMount(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

describe("WysiwygEditor onChange suppression", () => {
  it("does not call onChange on initial mount with a canonical value", async () => {
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
    await flushTipTapMount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange on initial mount when value is empty (regression for FE-W-101)", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <WysiwygEditor value="" onChange={onChange} disabled={false} />,
      );
    });
    await flushTipTapMount();
    // TipTap normalises "" → "<p></p>" through the ProseMirror schema.
    // Without `onCreate` seeding the guard, that normalisation would
    // trigger a spurious `onChange("<p></p>")` and dirty the editor.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange on initial mount when value is non-canonical HTML", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<P>raw</P>"
          onChange={onChange}
          disabled={false}
        />,
      );
    });
    await flushTipTapMount();
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
    await flushTipTapMount();
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
    await flushTipTapMount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does call onChange when the user edits the document (positive regression)", async () => {
    // Locate the editor instance via its DOM and dispatch an edit through
    // its public chain API. Without this positive case, an over-tight
    // `lastEmittedHtmlRef` guard could swallow real user input without
    // any test failing.
    const onChange = vi.fn();
    let capturedEditor: {
      commands: { insertContent: (s: string) => void };
    } | null = null;
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>start</p>"
          onChange={(html) => {
            onChange(html);
          }}
          disabled={false}
          editorRef={
            {
              get current() {
                return capturedEditor as never;
              },
              set current(v: never) {
                capturedEditor = v as never;
              },
            } as never
          }
        />,
      );
    });
    await flushTipTapMount();
    expect(onChange).not.toHaveBeenCalled();
    expect(capturedEditor).not.toBeNull();

    await act(async () => {
      capturedEditor?.commands.insertContent(" typed");
    });
    await flushTipTapMount();
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(lastCall).toContain("typed");
  });
});
