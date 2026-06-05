// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Menu, MenuItem } from "../Menu";

/**
 * Issue #467: locks the declarative `<Menu>`/`<MenuItem>` WAI-ARIA Menu
 * primitive — ARIA wiring, roving tabindex, dismiss + focus restoration,
 * menuitem activation order, the `aria-disabled` (not `disabled`) treatment
 * that keeps a pending item in the roving cycle, danger / separator markup,
 * `onTriggerClick` opt-in, and that non-MenuItem children are excluded from
 * the roving index.
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
  onA?: () => void;
  onB?: () => void;
  onC?: () => void;
  disabledC?: boolean;
  onTriggerClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  withHeader?: boolean;
};

function Harness({
  onA = vi.fn(),
  onB = vi.fn(),
  onC = vi.fn(),
  disabledC = false,
  onTriggerClick,
  withHeader = false,
}: Handlers) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      ariaLabel="テストメニュー"
      panelClassName="absolute right-0 mt-1 min-w-[180px]"
      onTriggerClick={onTriggerClick}
      trigger={(props) => (
        <button {...props} type="button" aria-label="メニューを開く">
          ⋯
        </button>
      )}
    >
      {withHeader ? <div data-testid="header">ヘッダ</div> : null}
      <MenuItem onSelect={onA}>項目A</MenuItem>
      <MenuItem onSelect={onB}>項目B</MenuItem>
      <MenuItem separatorBefore danger disabled={disabledC} onSelect={onC}>
        項目C
      </MenuItem>
    </Menu>
  );
}

function render(handlers: Handlers = {}) {
  act(() => {
    root.render(<Harness {...handlers} />);
  });
}

function trigger(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="メニューを開く"]',
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

describe("Menu", () => {
  it("renders a closed trigger with no menuitems and ARIA wiring", () => {
    render();
    const t = trigger();
    expect(t.getAttribute("aria-haspopup")).toBe("menu");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(t.getAttribute("aria-controls")).toBeNull();
    expect(menuitems()).toHaveLength(0);
  });

  it("opens on click, exposes aria-controls, and lands roving focus on the first item", () => {
    render();
    open();
    const t = trigger();
    expect(t.getAttribute("aria-expanded")).toBe("true");
    expect(t.getAttribute("aria-controls")).not.toBeNull();
    const items = menuitems();
    expect(items.map((el) => el.textContent)).toEqual([
      "項目A",
      "項目B",
      "項目C",
    ]);
    expect(items[0].getAttribute("tabindex")).toBe("0");
    expect(items[1].getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(items[0]);
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
    const onA = vi.fn();
    const onB = vi.fn();
    render({ onA, onB });
    open();
    act(() => {
      (menuitems()[0] as HTMLButtonElement).click();
    });
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
    expect(menuitems()).toHaveLength(0);
  });

  it("restores focus to the trigger BEFORE invoking onSelect (Dialog-connection order)", () => {
    let activeAtSelect: Element | null = null;
    const onA = () => {
      activeAtSelect = document.activeElement;
    };
    render({ onA });
    open();
    act(() => {
      (menuitems()[0] as HTMLButtonElement).click();
    });
    expect(activeAtSelect).toBe(trigger());
  });

  it("keeps an aria-disabled item focusable in the roving cycle and ignores its click", () => {
    const onC = vi.fn();
    render({ onC, disabledC: true });
    open();
    const items = menuitems();
    const c = items[2];
    expect(c.getAttribute("aria-disabled")).toBe("true");
    expect(c.hasAttribute("disabled")).toBe(false);
    keydownOnMenu("End");
    expect(c.getAttribute("tabindex")).toBe("0");
    act(() => {
      (c as HTMLButtonElement).click();
    });
    expect(onC).not.toHaveBeenCalled();
    expect(menuitems()).toHaveLength(3);
  });

  it("marks danger items with data-danger and renders separatorBefore as <hr>", () => {
    render();
    open();
    const c = menuitems()[2];
    expect(c.getAttribute("data-danger")).toBe("true");
    expect(container.querySelector('[role="menu"] hr')).not.toBeNull();
  });

  it("runs onTriggerClick before toggling open", () => {
    const onTriggerClick = vi.fn((e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
    });
    render({ onTriggerClick });
    open();
    expect(onTriggerClick).toHaveBeenCalledTimes(1);
    expect(menuitems()).toHaveLength(3);
  });

  it("excludes non-MenuItem children from the roving index", () => {
    render({ withHeader: true });
    open();
    const items = menuitems();
    // The header is rendered but not a menuitem; the three MenuItems keep a
    // contiguous roving index (first carries tabindex 0).
    expect(items).toHaveLength(3);
    expect(container.querySelector('[data-testid="header"]')).not.toBeNull();
    expect(items[0].getAttribute("tabindex")).toBe("0");
    keydownOnMenu("End");
    expect(items[2].getAttribute("tabindex")).toBe("0");
  });
});
