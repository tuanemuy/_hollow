// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WysiwygEditor } from "@/components/note/editor/WysiwygEditor";

/**
 * Issue #825: the WYSIWYG link button opens an in-app `LinkDialog` instead of
 * the native `window.prompt` / `window.alert`. These pin opening from the
 * toolbar, the inline `role="alert"` for an unsupported scheme (dialog stays
 * open — AC-7), and closing on a valid submit (AC-6).
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

async function flushTipTapMount(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function mount(value = "<p>hello</p>"): Promise<void> {
  await act(async () => {
    root.render(
      <WysiwygEditor value={value} onChange={vi.fn()} disabled={false} />,
    );
  });
  await flushTipTapMount();
}

function linkButton(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="リンク"]',
  );
}

function linkDialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="dialog"]');
}

function urlInput(): HTMLInputElement | null {
  const dialog = linkDialog();
  return (
    dialog?.querySelector<HTMLInputElement>('input[aria-label="リンク URL"]') ??
    null
  );
}

function dialogButton(label: string): HTMLButtonElement | undefined {
  const dialog = linkDialog();
  if (dialog === null) return undefined;
  return Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent?.trim() === label,
  );
}

async function typeUrl(value: string): Promise<void> {
  const input = urlInput();
  await act(async () => {
    if (input !== null) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

async function submitForm(): Promise<void> {
  // Dispatch the native submit event on the dialog's form so React's
  // `onSubmit` runs. happy-dom does not synthesize a submit event from a
  // submit `<button>`'s `.click()`.
  const form = linkDialog()?.querySelector("form");
  await act(async () => {
    form?.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

describe("WysiwygEditor LinkDialog (Issue #825)", () => {
  it("opens the link dialog from the toolbar link button", async () => {
    await mount();
    expect(linkDialog()).toBeNull();
    await act(async () => {
      linkButton()?.click();
    });
    expect(linkDialog()).not.toBeNull();
    expect(urlInput()).not.toBeNull();
    // Fresh insert (no selected link) offers 挿入, not 解除.
    expect(dialogButton("挿入")).toBeDefined();
    expect(dialogButton("解除")).toBeUndefined();
  });

  it("shows an inline alert for an unsupported scheme and keeps the dialog open", async () => {
    await mount();
    await act(async () => {
      linkButton()?.click();
    });
    await typeUrl("javascript:alert(1)");
    await submitForm();
    // Dialog stays open with a role="alert" error (native window.alert
    // replacement).
    const dialog = linkDialog();
    expect(dialog).not.toBeNull();
    const alert = dialog?.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent ?? "").toContain("対応していない URL スキーム");
  });

  it("closes the dialog on a valid URL submit", async () => {
    await mount();
    await act(async () => {
      linkButton()?.click();
    });
    await typeUrl("https://example.com");
    await submitForm();
    expect(linkDialog()).toBeNull();
  });
});
