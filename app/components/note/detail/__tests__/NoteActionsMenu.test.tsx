// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteActionsMenu } from "../NoteActionsMenu";

/**
 * Issue #459: locks the WAI-ARIA Menu behavior of the note-actions overflow
 * menu — roving tabindex, Escape / outside-click dismiss with focus
 * restoration, menuitem activation, and the `aria-disabled` (not `disabled`)
 * treatment that keeps a pending item focusable in the roving cycle
 * (review-001 W-001).
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

type Handlers = {
  onDuplicate?: () => void;
  onHistory?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
};

function render(handlers: Handlers = {}) {
  act(() => {
    root.render(
      <NoteActionsMenu
        onDuplicate={handlers.onDuplicate ?? vi.fn()}
        onHistory={handlers.onHistory ?? vi.fn()}
        onDelete={handlers.onDelete ?? vi.fn()}
        disabled={handlers.disabled ?? false}
      />,
    );
  });
}

function trigger(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="その他の操作"]',
  ) as HTMLButtonElement;
}

function open() {
  act(() => {
    trigger().click();
  });
}

function menuitems(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  );
}

function keydownOnMenu(key: string) {
  const menu = container.querySelector('[role="menu"]') as HTMLElement;
  act(() => {
    menu.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("NoteActionsMenu", () => {
  it("renders a closed trigger with no menuitems by default", () => {
    render();
    const t = trigger();
    expect(t.getAttribute("aria-haspopup")).toBe("menu");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(menuitems()).toHaveLength(0);
  });

  it("opens on click and lands roving focus on the first item", () => {
    render();
    open();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const items = menuitems();
    expect(items.map((el) => el.textContent)).toEqual(["複製", "履歴", "削除"]);
    expect(items[0].getAttribute("tabindex")).toBe("0");
    expect(items[1].getAttribute("tabindex")).toBe("-1");
  });

  it("moves roving focus with ArrowDown / End / Home", () => {
    render();
    open();
    keydownOnMenu("ArrowDown");
    expect(menuitems()[1].getAttribute("tabindex")).toBe("0");
    keydownOnMenu("End");
    expect(menuitems()[2].getAttribute("tabindex")).toBe("0");
    keydownOnMenu("Home");
    expect(menuitems()[0].getAttribute("tabindex")).toBe("0");
  });

  it("closes on Escape and restores focus to the trigger", () => {
    render();
    open();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(menuitems()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on an outside mousedown", () => {
    render();
    open();
    expect(menuitems()).toHaveLength(3);
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });
    expect(menuitems()).toHaveLength(0);
  });

  it("invokes the matching callback and closes when a menuitem is clicked", () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render({ onDuplicate, onDelete });
    open();
    act(() => {
      (menuitems()[0] as HTMLButtonElement).click();
    });
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(menuitems()).toHaveLength(0);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("marks 複製 / 削除 aria-disabled and ignores their clicks while disabled", () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onHistory = vi.fn();
    render({ onDuplicate, onDelete, onHistory, disabled: true });
    open();
    const [dup, hist, del] = menuitems();
    expect(dup.getAttribute("aria-disabled")).toBe("true");
    expect(del.getAttribute("aria-disabled")).toBe("true");
    // 履歴 is not gated by `disabled`, so it stays enabled.
    expect(hist.getAttribute("aria-disabled")).toBeNull();
    // Disabled items keep their place in the roving cycle (remain focusable).
    expect(dup.hasAttribute("disabled")).toBe(false);
    act(() => {
      (dup as HTMLButtonElement).click();
    });
    expect(onDuplicate).not.toHaveBeenCalled();
    // Menu stays open since the disabled click is a no-op.
    expect(menuitems()).toHaveLength(3);
  });
});
