// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "../Dialog";

// Opt into React's testing-environment behavior (silences "not configured
// to support act(...)" warnings for asynchronous state commits).
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
  // Leak detector: the body scroll lock counter is module-scope mutable state.
  // If a test throws after render but before unmount, the useEffect cleanup
  // would not run and `document.body.style.overflow` would stay "hidden",
  // surfacing as a confusing failure several tests later. Asserting here pins
  // the leak to the offending test.
  expect(document.body.style.overflow).toBe("");
});

function getBackdrop(): HTMLElement {
  // The Dialog portals into `document.body`. The backdrop is the only
  // child rendered by the Dialog primitive, so we find it via the class
  // shared with `dialogBackdrop` (the `fixed inset-0` element).
  const backdrop = document.body.querySelector<HTMLElement>(".fixed.inset-0");
  if (backdrop === null) throw new Error("backdrop not rendered");
  return backdrop;
}

function getPanel(): HTMLElement {
  const panel = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (panel === null) throw new Error("panel not rendered");
  return panel;
}

function fireMouseDownClick(target: EventTarget) {
  // Dispatch mousedown then click in sequence so the origin guard sees both
  // halves of the gesture starting and ending on the same target.
  const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  target.dispatchEvent(down);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(click);
}

describe("Dialog backdrop close behavior", () => {
  it("does not call onClose on backdrop click by default", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose}>
          <p>body</p>
        </Dialog>,
      );
    });

    const backdrop = getBackdrop();
    act(() => {
      fireMouseDownClick(backdrop);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when mousedown+click both originate on the backdrop with closeOnBackdropClick=true", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose} closeOnBackdropClick={true}>
          <p>body</p>
        </Dialog>,
      );
    });

    const backdrop = getBackdrop();
    act(() => {
      fireMouseDownClick(backdrop);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when mousedown originated inside the panel (origin guard)", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose} closeOnBackdropClick={true}>
          <p data-testid="body">body</p>
        </Dialog>,
      );
    });

    const backdrop = getBackdrop();
    const panel = getPanel();

    // Press inside the panel; the panel's onMouseDown stops propagation so
    // the backdrop never records this press as its mousedown origin.
    act(() => {
      panel.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    });
    // Release on the backdrop.
    act(() => {
      backdrop.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose even when backdrop receives a synthetic click after panel-originated mousedown", () => {
    // Stronger variant of the origin guard test. Sequence:
    //   1. panel mousedown (panel's onMouseDown calls stopPropagation, so
    //      React's synthetic event never reaches the backdrop's onMouseDown
    //      and `mousedownTargetRef` remains null)
    //   2. backdrop click (synthetic, no preceding backdrop mousedown)
    // If stopPropagation regressed and the panel mousedown bubbled to the
    // backdrop, the ref would record the panel as the origin and the
    // subsequent click would still be rejected because the origin !== backdrop.
    // The new ref-clear-on-click logic also guarantees a script-driven click
    // with no preceding mousedown is rejected outright.
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose} closeOnBackdropClick={true}>
          <p data-testid="body">body</p>
        </Dialog>,
      );
    });

    const backdrop = getBackdrop();
    const panel = getPanel();

    act(() => {
      panel.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    });
    // No backdrop mousedown — directly synthesize a click on the backdrop.
    act(() => {
      backdrop.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose on backdrop click when closable=false", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog
          open={true}
          onClose={onClose}
          closeOnBackdropClick={true}
          closable={false}
        >
          <p>body</p>
        </Dialog>,
      );
    });

    const backdrop = getBackdrop();
    act(() => {
      fireMouseDownClick(backdrop);
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Dialog close button rendering", () => {
  it("does not render the × button by default", () => {
    act(() => {
      root.render(
        <Dialog open={true} onClose={() => {}}>
          <p>body</p>
        </Dialog>,
      );
    });

    const closeBtn = document.body.querySelector('button[aria-label="閉じる"]');
    expect(closeBtn).toBeNull();
  });

  it("renders the × button and calls onClose on click when showCloseButton=true", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <Dialog open={true} onClose={onClose} showCloseButton={true}>
          <p>body</p>
        </Dialog>,
      );
    });

    const closeBtn = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="閉じる"]',
    );
    expect(closeBtn).not.toBeNull();
    act(() => {
      closeBtn?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the × button as disabled when closable=false", () => {
    act(() => {
      root.render(
        <Dialog
          open={true}
          onClose={() => {}}
          showCloseButton={true}
          closable={false}
        >
          <p>body</p>
        </Dialog>,
      );
    });

    const closeBtn = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="閉じる"]',
    );
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.disabled).toBe(true);
  });

  it("does not focus the × button as the initial focus target when another focusable exists", async () => {
    act(() => {
      root.render(
        <Dialog open={true} onClose={() => {}} showCloseButton={true}>
          <button type="button" data-testid="primary">
            Primary
          </button>
        </Dialog>,
      );
    });

    // Initial focus is committed inside a requestAnimationFrame callback
    // scheduled by `useEffect`. Wrap the wait in `act` so the rAF callback
    // (which mutates `document.activeElement`) is observed inside React's
    // batching window.
    await act(async () => {
      await new Promise<void>((resolve) => {
        // Two rAF turns guarantee the effect-scheduled rAF callback has run.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });

    const closeBtn = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="閉じる"]',
    );
    const primaryBtn = document.body.querySelector<HTMLButtonElement>(
      'button[data-testid="primary"]',
    );
    expect(closeBtn).not.toBeNull();
    expect(primaryBtn).not.toBeNull();
    expect(document.activeElement).not.toBe(closeBtn);
    expect(document.activeElement).toBe(primaryBtn);
  });

  it("includes the × button in the Tab cycle (reachable by keyboard)", async () => {
    // ADR-004 contract has two halves: (1) the × is excluded from initial
    // focus (covered above) and (2) it remains reachable via Tab. The latter
    // would silently regress if the `:not([data-dialog-close])` filter were
    // ever applied to `FOCUSABLE_SELECTOR` as well — this test pins it down.
    act(() => {
      root.render(
        <Dialog open={true} onClose={() => {}} showCloseButton={true}>
          <button type="button" data-testid="primary">
            Primary
          </button>
        </Dialog>,
      );
    });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });

    const panel = getPanel();
    const closeBtn = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="閉じる"]',
    );
    const primaryBtn = document.body.querySelector<HTMLButtonElement>(
      'button[data-testid="primary"]',
    );
    expect(closeBtn).not.toBeNull();
    expect(primaryBtn).not.toBeNull();

    // Direct assertion: the × must appear in the unfiltered focusables list
    // the focus trap walks. This is robust under happy-dom's incomplete
    // focus-on-Tab support and pins the regression we care about.
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])',
      ),
    );
    expect(focusables).toContain(closeBtn);
    expect(focusables).toContain(primaryBtn);

    // Behavioral check: with primary focused, dispatching Tab into the
    // document-level focus trap should not preventDefault when the active
    // element is mid-cycle (i.e. native Tab moves focus to the close button).
    // happy-dom does not implement native Tab-focus traversal, so we drive
    // the move manually and assert the trap does not wrap when not at the
    // boundary.
    primaryBtn?.focus();
    expect(document.activeElement).toBe(primaryBtn);
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tabEvent);
    // The trap only intervenes at the boundary. Primary is the first
    // focusable (close button is rendered before it in the DOM? no — close
    // button is rendered first, then children). So primary is the *last*
    // focusable, and forward Tab from last must wrap to the first (close).
    // Assert the trap fired and moved focus to the close button.
    expect(document.activeElement).toBe(closeBtn);
  });
});
