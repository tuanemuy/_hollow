// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WysiwygEditor } from "@/components/note/editor/WysiwygEditor";

/**
 * Issue #37 regression: detection of unsupported tags must run exactly
 * once in `onCreate` against the *original* `value`, and the banner DOM
 * must reflect the `unsupportedAck` state via role/button toggle. Pins
 * both the `onCreate`-only detection contract (ADR-005) and the a11y
 * surface (ADR-003) so a future refactor cannot drop them silently.
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

async function flushTipTapMount(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

describe("WysiwygEditor onCreate unsupported-tag detection", () => {
  it("does not fire onUnsupportedTagsDetected for canonical supported HTML", async () => {
    const onDetected = vi.fn();
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>hi</p>"
          onChange={vi.fn()}
          disabled={false}
          onUnsupportedTagsDetected={onDetected}
        />,
      );
    });
    await flushTipTapMount();
    expect(onDetected).not.toHaveBeenCalled();
  });

  it("fires onUnsupportedTagsDetected exactly once on mount for unsupported HTML", async () => {
    const onDetected = vi.fn();
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<table><tr><td>x</td></tr></table>"
          onChange={vi.fn()}
          disabled={false}
          onUnsupportedTagsDetected={onDetected}
        />,
      );
    });
    await flushTipTapMount();
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith(["table", "td", "tr"]);
  });

  it("does not re-fire onUnsupportedTagsDetected when content is edited after mount", async () => {
    // ADR-005: detection is locked to `onCreate`. Edits flowing through
    // `onUpdate` must not trigger re-detection — TipTap has already
    // flattened the unsupported nodes by then, and re-running would
    // wipe the warning the moment the user types.
    const onDetected = vi.fn();
    let capturedEditor: {
      chain: () => {
        focus: () => {
          insertContent: (s: string) => { run: () => void };
        };
      };
    } | null = null;
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<table><tr><td>x</td></tr></table>"
          onChange={vi.fn()}
          disabled={false}
          onUnsupportedTagsDetected={onDetected}
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
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(capturedEditor).not.toBeNull();

    await act(async () => {
      capturedEditor?.chain().focus().insertContent(" typed").run();
    });
    await flushTipTapMount();
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it('renders role="alert" + acknowledge button when unsupported tags are not yet acked', async () => {
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>hi</p>"
          onChange={vi.fn()}
          disabled={false}
          unsupportedTags={["mark", "table"]}
          unsupportedAck={false}
          onUnsupportedTagsDetected={vi.fn()}
          onAcknowledge={vi.fn()}
        />,
      );
    });
    await flushTipTapMount();
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    const button = alert?.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("了解した");
  });

  it('renders role="note" without an acknowledge button once acked', async () => {
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>hi</p>"
          onChange={vi.fn()}
          disabled={false}
          unsupportedTags={["mark", "table"]}
          unsupportedAck={true}
          onUnsupportedTagsDetected={vi.fn()}
          onAcknowledge={vi.fn()}
        />,
      );
    });
    await flushTipTapMount();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const note = container.querySelector('[role="note"]');
    expect(note).not.toBeNull();
    expect(note?.querySelector("button")).toBeNull();
  });
});
