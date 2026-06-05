// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Popover } from "../Popover";
import { computeShiftX, VIEWPORT_MARGIN } from "../usePopover";

/**
 * Issue #467: locks the first-layer `<Popover>` dual-mode primitive — dialog
 * role / ARIA wiring, dismiss (Escape / outside / focus-out), the `close`
 * render-prop callback that restores focus to the trigger, and the horizontal
 * viewport clamp (`shiftX`, exercised as a pure function + one DOM stub case
 * because happy-dom has no layout).
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("computeShiftX", () => {
  it("returns 0 when the panel fits inside the viewport", () => {
    expect(computeShiftX({ left: 100, right: 380 }, 1000)).toBe(0);
  });

  it("shifts left when the panel overflows the right edge", () => {
    // right 1000 in a 1000-wide viewport with margin 8 → shift -8.
    expect(computeShiftX({ left: 720, right: 1000 }, 1000)).toBe(
      -VIEWPORT_MARGIN,
    );
  });

  it("shifts right when the panel overflows the left edge", () => {
    // left -20 → must move to margin 8 → shift +28.
    expect(computeShiftX({ left: -20, right: 260 }, 1000)).toBe(
      VIEWPORT_MARGIN - -20,
    );
  });
});

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

type HarnessProps = {
  clampToViewport?: boolean;
  initialOpen?: boolean;
};

function Harness({ clampToViewport, initialOpen = false }: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      haspopup="dialog"
      label="テストダイアログ"
      panelClassName="absolute left-0 top-full"
      clampToViewport={clampToViewport}
      trigger={(props) => (
        <button {...props} type="button" aria-label="開く">
          開く
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <span>本文</span>
          <button type="button" onClick={close}>
            閉じる
          </button>
        </div>
      )}
    </Popover>
  );
}

function trigger(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="開く"]',
  ) as HTMLButtonElement;
}

function panel(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="dialog"]');
}

function render(props: HarnessProps = {}) {
  act(() => {
    root.render(<Harness {...props} />);
  });
}

describe("Popover (dialog mode)", () => {
  it("wires aria-haspopup=dialog and renders role=dialog when open", () => {
    render();
    const t = trigger();
    expect(t.getAttribute("aria-haspopup")).toBe("dialog");
    expect(panel()).toBeNull();
    act(() => {
      t.click();
    });
    expect(t.getAttribute("aria-expanded")).toBe("true");
    expect(panel()).not.toBeNull();
    expect(panel()?.getAttribute("aria-label")).toBe("テストダイアログ");
  });

  it("closes on Escape", () => {
    render({ initialOpen: true });
    expect(panel()).not.toBeNull();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(panel()).toBeNull();
  });

  it("closes on an outside mousedown", () => {
    render({ initialOpen: true });
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });
    expect(panel()).toBeNull();
  });

  it("closes on focus-out when focus moves to an element outside the container", () => {
    // A focus target outside the popover container; the onFocusOut handler
    // closes only when relatedTarget is outside the container.
    const outside = document.createElement("button");
    outside.type = "button";
    document.body.appendChild(outside);
    try {
      render({ initialOpen: true });
      const body = panel()?.querySelector("span") as HTMLElement;
      // React maps the bubbling native `focusout` event to `onBlur`; happy-dom
      // needs relatedTarget supplied explicitly.
      act(() => {
        body.dispatchEvent(
          new FocusEvent("focusout", {
            bubbles: true,
            relatedTarget: outside,
          }),
        );
      });
      expect(panel()).toBeNull();
    } finally {
      outside.remove();
    }
  });

  it("the close render-prop callback closes and restores focus to the trigger", () => {
    render({ initialOpen: true });
    const closeBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent === "閉じる") as HTMLButtonElement;
    act(() => {
      closeBtn.click();
    });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("applies a translateX clamp when the panel overflows the viewport", () => {
    const rectStub = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 800,
        right: 1080,
        top: 0,
        bottom: 0,
        width: 280,
        height: 0,
        x: 800,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    const innerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      configurable: true,
      writable: true,
    });
    try {
      render({ clampToViewport: true, initialOpen: true });
      expect(panel()?.style.transform).toContain("translateX(");
    } finally {
      rectStub.mockRestore();
      Object.defineProperty(window, "innerWidth", {
        value: innerWidth,
        configurable: true,
        writable: true,
      });
    }
  });
});
