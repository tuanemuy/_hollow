// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Popover } from "../Popover";
import { computeShiftX, computeShiftY, VIEWPORT_MARGIN } from "../usePopover";

/**
 * Issue #467 / #652: locks the first-layer `<Popover>` dual-mode primitive —
 * dialog role / ARIA wiring, dismiss (Escape / outside / focus-out), the `close`
 * render-prop callback that restores focus to the trigger, and the viewport
 * clamp (`shiftX` horizontal + `shiftY` vertical, exercised as pure functions +
 * DOM stub cases because happy-dom has no layout).
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

describe("computeShiftY", () => {
  it("returns 0 when the panel fits inside the viewport", () => {
    expect(computeShiftY({ top: 100, bottom: 380 }, 1000)).toBe(0);
  });

  it("shifts up when the panel overflows the bottom edge", () => {
    // bottom 1000 in a 1000-tall viewport with margin 8 → shift -8.
    expect(computeShiftY({ top: 720, bottom: 1000 }, 1000)).toBe(
      -VIEWPORT_MARGIN,
    );
  });

  it("shifts down when the panel overflows the top edge", () => {
    // top -20 → must move to margin 8 → shift +28.
    expect(computeShiftY({ top: -20, bottom: 260 }, 1000)).toBe(
      VIEWPORT_MARGIN - -20,
    );
  });

  it("prefers the top edge when the panel is taller than the viewport", () => {
    // Panel 700px tall in a 600px viewport (margin 8): bottom-edge correction
    // would move it to -208, pushing top to -208; the top-edge correction then
    // wins and pins top to margin 8 (head visible, tail out of reach). #652
    // S-002 — locks the boundary against the future max-height path.
    expect(computeShiftY({ top: 200, bottom: 900 }, 600)).toBe(
      VIEWPORT_MARGIN - 200,
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

  it("stays open on focus-out with relatedTarget=null (focus lost, not moved)", () => {
    // After a filter navigation commits, the RSC re-render can drop focus
    // from a roving-focused option straight to <body> (focusout with
    // relatedTarget=null). That focus *loss* must not
    // dismiss the panel — only real user dismissal paths (outside mousedown,
    // Escape, Tab-out with a non-null relatedTarget) close it.
    render({ initialOpen: true });
    const body = panel()?.querySelector("span") as HTMLElement;
    act(() => {
      body.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
      );
    });
    expect(panel()).not.toBeNull();
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

  // #649: the menu / listbox branches are separate JSX (literal `role` for
  // the a11y lint), so the Safari/Firefox click-drop guard (panel
  // `onMouseDown` preventDefault keeps focus from blurring to <body> and
  // closing before the click lands) must be locked per branch. The dialog
  // branch deliberately omits it so form inputs inside can take focus. The
  // listbox panel scrolls, so a mousedown on the panel itself (scrollbar)
  // must NOT be prevented — only on its children.
  it.each([
    ["menu", true, "child"],
    ["listbox", true, "child"],
    ["listbox", false, "panel"],
    ["dialog", false, "child"],
  ] as const)("%s mousedown defaultPrevented = %s (target: %s)", (haspopup, prevented, target) => {
    function RoleHarness() {
      const [open, setOpen] = useState(true);
      return (
        <Popover
          open={open}
          onOpenChange={setOpen}
          haspopup={haspopup}
          label="テストパネル"
          panelClassName="absolute left-0 top-full"
          trigger={(props) => (
            <button {...props} type="button" aria-label="開く">
              開く
            </button>
          )}
        >
          <span>本文</span>
        </Popover>
      );
    }
    act(() => {
      root.render(<RoleHarness />);
    });
    const panelEl = container.querySelector<HTMLElement>(
      `[role="${haspopup}"]`,
    ) as HTMLElement;
    const targetEl =
      target === "panel"
        ? panelEl
        : (panelEl.querySelector("span") as HTMLElement);
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      targetEl.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(prevented);
    // An inside mousedown never counts as an outside-dismiss.
    expect(container.querySelector(`[role="${haspopup}"]`)).not.toBeNull();
  });

  // The tag picker is a multi-select listbox; `multiselectable` must
  // reach the listbox panel as `aria-multiselectable="true"` and stay absent
  // by default (single-select consumers like ViewSwitcher are untouched).
  it.each([
    [true, "true"],
    [undefined, null],
  ] as const)("listbox multiselectable=%s renders aria-multiselectable=%s", (multiselectable, expected) => {
    function ListboxHarness() {
      const [open, setOpen] = useState(true);
      return (
        <Popover
          open={open}
          onOpenChange={setOpen}
          haspopup="listbox"
          multiselectable={multiselectable}
          label="テストリスト"
          panelClassName="absolute left-0 top-full"
          trigger={(props) => (
            <button {...props} type="button" aria-label="開く">
              開く
            </button>
          )}
        >
          <span>本文</span>
        </Popover>
      );
    }
    act(() => {
      root.render(<ListboxHarness />);
    });
    const listbox = container.querySelector<HTMLElement>('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox?.getAttribute("aria-multiselectable")).toBe(expected);
  });

  it("applies a horizontal clamp only (shiftX) when the panel overflows the right edge", () => {
    // happy-dom has no layout, so getBoundingClientRect returns all-zero; we
    // stub it on Element.prototype (the only knob available — happy-dom can't
    // set a layout rect per element), which makes every element (trigger /
    // container / panel) report the same rect. The clamp only reads the panel
    // rect, so a single shared rect is sufficient here.
    //
    // Axis isolation: vertical is inside [8, 760] (viewport 768, margin 8) so
    // computeShiftY === 0, while horizontal overflows the right edge.
    // computeShiftX({left:800,right:1080}, 1000): right 1080 > 992 →
    // shift = 1000 - 8 - 1080 = -88; left+shift = 712 ≥ 8 → shiftX = -88.
    const rectStub = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 800,
        right: 1080,
        top: 100,
        bottom: 380,
        width: 280,
        height: 280,
        x: 800,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 768,
      configurable: true,
      writable: true,
    });
    try {
      render({ clampToViewport: true, initialOpen: true });
      // #652 (C): two-arg `translate(x, y)`. y must be exactly 0 here — if
      // computeShiftX is broken the x changes; if computeShiftY leaks the y
      // becomes non-zero. Full-value equality fails on either regression.
      expect(panel()?.style.transform).toBe("translate(-88px, 0px)");
    } finally {
      rectStub.mockRestore();
      Object.defineProperty(window, "innerWidth", {
        value: innerWidth,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, "innerHeight", {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it("applies a vertical clamp only (shiftY) when the panel overflows the bottom edge", () => {
    // Same Element.prototype stub rationale as above (shared rect, panel-only
    // read). Axis isolation: horizontal is inside [8, 992] (viewport 1000,
    // margin 8) so computeShiftX === 0, while vertical overflows the bottom.
    // computeShiftY({top:500,bottom:760}, 633): bottom 760 > 625 →
    // shift = 633 - 8 - 760 = -135; top+shift = 365 ≥ 8 → shiftY = -135.
    const rectStub = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 100,
        right: 380,
        top: 500,
        bottom: 760,
        width: 280,
        height: 260,
        x: 100,
        y: 500,
        toJSON: () => ({}),
      } as DOMRect);
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 633,
      configurable: true,
      writable: true,
    });
    try {
      render({ clampToViewport: true, initialOpen: true });
      // x must be exactly 0 here (no horizontal overflow); y is the negative
      // bottom-edge correction. Full-value equality fails if computeShiftY is
      // broken or if the translate args are swapped.
      expect(panel()?.style.transform).toBe("translate(0px, -135px)");
    } finally {
      rectStub.mockRestore();
      Object.defineProperty(window, "innerWidth", {
        value: innerWidth,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, "innerHeight", {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it("composes both axes into a single translate(x, y) when the panel overflows both edges", () => {
    // Same Element.prototype stub rationale (shared rect, panel-only read).
    // Both axes overflow with distinct absolute values (|x|=88, |y|=135) so an
    // argument-order swap (translate(y, x)) is also caught.
    // computeShiftX({left:800,right:1080}, 1000) = -88;
    // computeShiftY({top:500,bottom:760}, 633) = -135.
    const rectStub = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 800,
        right: 1080,
        top: 500,
        bottom: 760,
        width: 280,
        height: 260,
        x: 800,
        y: 500,
        toJSON: () => ({}),
      } as DOMRect);
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 633,
      configurable: true,
      writable: true,
    });
    try {
      render({ clampToViewport: true, initialOpen: true });
      expect(panel()?.style.transform).toBe("translate(-88px, -135px)");
    } finally {
      rectStub.mockRestore();
      Object.defineProperty(window, "innerWidth", {
        value: innerWidth,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, "innerHeight", {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }
  });

  it("skips the clamp below the sheet breakpoint (AC-4)", () => {
    // A rect that overflows both edges, but at < 640px width the sheet panel is
    // a bottom-pinned `max-sm:` sheet — the clamp must be skipped entirely so
    // neither shiftX nor shiftY lands on the transform. Same Element.prototype
    // stub rationale as the clamp tests (shared rect, panel-only read); here we
    // also assert it is never called, which is what proves the *computation*
    // (not just the result) was skipped — the essence of AC-4's early return.
    const rectStub = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 0,
        right: 480,
        top: 500,
        bottom: 760,
        width: 480,
        height: 260,
        x: 0,
        y: 500,
        toJSON: () => ({}),
      } as DOMRect);
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      value: 500,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 633,
      configurable: true,
      writable: true,
    });
    try {
      render({ clampToViewport: true, initialOpen: true });
      // panelStyle is undefined when both shifts are 0, so style.transform is
      // the empty string — assert it strictly (not toBeFalsy) and confirm the
      // overflow rect was never measured.
      expect(panel()?.style.transform).toBe("");
      expect(rectStub).not.toHaveBeenCalled();
    } finally {
      rectStub.mockRestore();
      Object.defineProperty(window, "innerWidth", {
        value: innerWidth,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, "innerHeight", {
        value: innerHeight,
        configurable: true,
        writable: true,
      });
    }
  });
});
