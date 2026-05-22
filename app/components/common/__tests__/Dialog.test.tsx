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

function fireMouseDownClick(target: EventTarget, currentTarget?: EventTarget) {
  // Simulate a pointer interaction by dispatching mousedown then click in
  // sequence. We dispatch on the actual `target` and let bubbling carry the
  // event to the backdrop's listener (which is what React's onClick observes
  // via delegation in real browsers; happy-dom delivers it via the actual
  // listeners attached). For our purposes — the backdrop's onClick and
  // onMouseDown are attached directly to the backdrop div — dispatching on
  // the backdrop suffices for the "click on backdrop" cases. The optional
  // `currentTarget` is unused by the dispatch but documents intent.
  void currentTarget;
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
});
