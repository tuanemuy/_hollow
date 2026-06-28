// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WysiwygEditor } from "@/components/note/editor/WysiwygEditor";

/**
 * Issue #798: the WYSIWYG toolbar's「画像」button wires to the parent
 * `MediaUploader` via `onRequestImage`. happy-dom cannot drive a real
 * file-picker dialog, so these tests pin the button's presence, its
 * click → `onRequestImage` firing, and its disabled state when no
 * handler is wired (the proxy for AC-1/AC-2/AC-6/AC-7).
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

function findImageButton(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="画像"]',
  );
}

describe("WysiwygEditor image toolbar button", () => {
  it("renders the image button inside the toolbar and fires onRequestImage on click", async () => {
    const onRequestImage = vi.fn();
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>hello</p>"
          onChange={vi.fn()}
          disabled={false}
          onRequestImage={onRequestImage}
        />,
      );
    });
    await flushTipTapMount();

    const button = findImageButton();
    expect(button).not.toBeNull();
    expect(button?.closest('[role="toolbar"]')).not.toBeNull();
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.getAttribute("title")).toBe("画像");
    // Single-action button, not a toggle (AC-7).
    expect(button?.hasAttribute("aria-pressed")).toBe(false);
    expect(button?.hasAttribute("data-primary")).toBe(false);
    expect(button?.disabled).toBe(false);

    await act(async () => {
      button?.click();
    });
    expect(onRequestImage).toHaveBeenCalledTimes(1);
  });

  it("disables the image button when onRequestImage is omitted", async () => {
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>hello</p>"
          onChange={vi.fn()}
          disabled={false}
        />,
      );
    });
    await flushTipTapMount();

    const button = findImageButton();
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
  });

  it("disables the image button when disabled is true even with a handler (AC-6)", async () => {
    // `disabled` flows into `isDisabled` (`disabled === true || !isReady`),
    // and the image button is `disabled={isDisabled || onRequestImage ===
    // undefined}`. With a handler wired but `disabled={true}`, the button must
    // still be disabled — pins the disabled-prop branch independently of the
    // omitted-handler branch above.
    const onRequestImage = vi.fn();
    await act(async () => {
      root.render(
        <WysiwygEditor
          value="<p>hello</p>"
          onChange={vi.fn()}
          disabled={true}
          onRequestImage={onRequestImage}
        />,
      );
    });
    await flushTipTapMount();

    const button = findImageButton();
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    // A disabled button must not invoke the handler on click.
    await act(async () => {
      button?.click();
    });
    expect(onRequestImage).not.toHaveBeenCalled();
  });
});
