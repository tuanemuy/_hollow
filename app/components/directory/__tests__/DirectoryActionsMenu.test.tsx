// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryActionsMenu } from "../DirectoryActionsMenu";

/**
 * Issue #467: locks the DirectoryActionsMenu migration onto the shared
 * `<Menu>` primitive — the four directory operations, roving focus, menuitem
 * activation, and the directory-specific opt-ins: the trigger click stops
 * propagation (so it does not bubble to the enclosing treeitem) and Arrow keys
 * on the panel stop propagation (so DirectoryTree's sibling navigation does
 * not double-fire).
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
  onCreateChild?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
};

function render(handlers: Handlers = {}) {
  act(() => {
    root.render(
      <DirectoryActionsMenu
        triggerLabel="ディレクトリの操作"
        onCreateChild={handlers.onCreateChild ?? vi.fn()}
        onRename={handlers.onRename ?? vi.fn()}
        onMove={handlers.onMove ?? vi.fn()}
        onDelete={handlers.onDelete ?? vi.fn()}
      />,
    );
  });
}

function trigger(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="ディレクトリの操作"]',
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

describe("DirectoryActionsMenu", () => {
  it("renders a closed trigger then opens the four operations", () => {
    render();
    expect(menuitems()).toHaveLength(0);
    open();
    expect(menuitems().map((el) => el.textContent)).toEqual([
      "子ディレクトリを作成",
      "リネーム",
      "移動",
      "削除",
    ]);
    expect(menuitems()[0].getAttribute("tabindex")).toBe("0");
    expect(menuitems()[3].getAttribute("data-danger")).toBe("true");
  });

  it("invokes the matching callback and closes on menuitem click", () => {
    const onRename = vi.fn();
    render({ onRename });
    open();
    act(() => {
      (menuitems()[1] as HTMLButtonElement).click();
    });
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(menuitems()).toHaveLength(0);
  });

  it("stops propagation of the trigger click (does not bubble to the treeitem)", () => {
    const onOuterClick = vi.fn();
    // The menu is mounted inside `container`; observing a click bubbling to
    // the container's parent (document.body) confirms stopPropagation.
    document.body.addEventListener("click", onOuterClick);
    render();
    act(() => {
      trigger().click();
    });
    expect(menuitems()).toHaveLength(4);
    expect(onOuterClick).not.toHaveBeenCalled();
    document.body.removeEventListener("click", onOuterClick);
  });

  it("stops propagation of Arrow keydown on the open menu", () => {
    const onOuterKeyDown = vi.fn();
    document.body.addEventListener("keydown", onOuterKeyDown);
    render();
    open();
    const menu = container.querySelector('[role="menu"]') as HTMLElement;
    act(() => {
      menu.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    // Roving moved, and the event did not reach the document body.
    expect(menuitems()[1].getAttribute("tabindex")).toBe("0");
    expect(onOuterKeyDown).not.toHaveBeenCalled();
    document.body.removeEventListener("keydown", onOuterKeyDown);
  });
});
