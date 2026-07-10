// @vitest-environment happy-dom

import type { Editor } from "@tiptap/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WysiwygEditor } from "@/components/note/editor/WysiwygEditor";

/**
 * Issue #825: the low-frequency format buttons (Strike / H2 / H3 / Quote /
 * Code) move into a mobile-only `⋯` overflow menu so the toolbar fits at 390px
 * without a horizontal scroll (AC-1). These pin the overflow trigger's a11y
 * wiring, the menu contents, WAI-ARIA dismiss, and that selecting an item
 * applies the format (AC-3). happy-dom has no CSS, so the `sm:hidden` wrapper
 * is inert here — the trigger is always present and reachable in tests.
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

async function mount(
  value = "<p>hello</p>",
  onChange: (html: string) => void = vi.fn(),
  editorRef?: React.RefObject<Editor | null>,
): Promise<void> {
  await act(async () => {
    root.render(
      <WysiwygEditor
        value={value}
        onChange={onChange}
        disabled={false}
        {...(editorRef !== undefined ? { editorRef } : {})}
      />,
    );
  });
  await flushTipTapMount();
}

function overflowTrigger(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="その他の書式"]',
  );
}

function openMenu(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="menu"]');
}

function menuItemLabels(): string[] {
  const menu = openMenu();
  if (menu === null) return [];
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ).map((b) => b.textContent?.trim() ?? "");
}

describe("WysiwygEditor toolbar overflow menu (Issue #825)", () => {
  it("wires the overflow trigger as a WAI-ARIA menu button", async () => {
    await mount();
    const trigger = overflowTrigger();
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    // The trigger lives inside the toolbar grouping (role="toolbar").
    expect(trigger?.closest('[role="toolbar"]')).not.toBeNull();
  });

  it("opens a menu listing exactly the overflow formats in DOM order", async () => {
    await mount();
    await act(async () => {
      overflowTrigger()?.click();
    });
    expect(openMenu()).not.toBeNull();
    expect(overflowTrigger()?.getAttribute("aria-expanded")).toBe("true");
    expect(menuItemLabels()).toEqual([
      "取り消し線",
      "見出し 2",
      "見出し 3",
      "引用",
      "インラインコード",
    ]);
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    await mount();
    await act(async () => {
      overflowTrigger()?.click();
    });
    expect(openMenu()).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(openMenu()).toBeNull();
    expect(document.activeElement).toBe(overflowTrigger());
  });

  it("applies the format and closes the menu when an item is selected", async () => {
    const onChange = vi.fn();
    await mount("<p>hello</p>", onChange);
    await act(async () => {
      overflowTrigger()?.click();
    });
    const heading = Array.from(
      openMenu()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ??
        [],
    ).find((b) => b.textContent?.trim() === "見出し 2");
    expect(heading).toBeDefined();
    await act(async () => {
      heading?.click();
    });
    // Selecting the item runs the format command (onChange fires with the
    // heading applied) and closes the menu (`runAndClose`).
    expect(openMenu()).toBeNull();
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain("<h2");
  });

  it("shows the applied-state marker on active items when the menu opens (AC-3 / T-W-004)", async () => {
    // Cursor inside an <h2>, so 見出し 2 is active on open. The marker is an
    // sr-only「（適用中）」label beside the visual Check (#825 a11y W-001), so
    // assert on that accessible text rather than the aria-hidden icon.
    const editorRef: React.RefObject<Editor | null> = { current: null };
    await mount("<h2>title</h2>", vi.fn(), editorRef);
    await act(async () => {
      editorRef.current?.commands.setTextSelection(2);
    });
    await act(async () => {
      overflowTrigger()?.click();
    });
    const items = Array.from(
      openMenu()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ??
        [],
    );
    const active = items.find((b) => b.textContent?.includes("見出し 2"));
    const inactive = items.find((b) => b.textContent?.includes("取り消し線"));
    expect(active?.textContent).toContain("（適用中）");
    expect(inactive?.textContent ?? "").not.toContain("（適用中）");
  });
});
