// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SubmitButton } from "../SubmitButton";

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

function getButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    "button[type='submit']",
  );
  if (button === null) throw new Error("submit button not rendered");
  return button;
}

describe("SubmitButton", () => {
  it("renders the idle label and stays enabled when the form is not submitting", () => {
    act(() => {
      root.render(
        <form>
          <SubmitButton label="保存" pendingLabel="保存中..." />
        </form>,
      );
    });
    const button = getButton();
    // useFormStatus().pending is false when no submission is in flight.
    expect(button.textContent).toBe("保存");
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("stays disabled when the caller passes disabled (non-form state)", () => {
    act(() => {
      root.render(
        <form>
          <SubmitButton label="閲覧する" pendingLabel="確認中..." disabled />
        </form>,
      );
    });
    expect(getButton().disabled).toBe(true);
  });

  it("uses the provided className", () => {
    act(() => {
      root.render(
        <form>
          <SubmitButton
            label="送信"
            pendingLabel="送信中..."
            className="custom-class"
          />
        </form>,
      );
    });
    expect(getButton().className).toBe("custom-class");
  });

  it("emits data-primary by default and drops it when primary is false", () => {
    act(() => {
      root.render(
        <form>
          <SubmitButton label="保存" pendingLabel="保存中..." />
        </form>,
      );
    });
    expect(getButton().getAttribute("data-primary")).toBe("");

    act(() => {
      root.render(
        <form>
          <SubmitButton label="保存" pendingLabel="保存中..." primary={false} />
        </form>,
      );
    });
    expect(getButton().getAttribute("data-primary")).toBeNull();
  });

  // The whole point of useFormStatus(): while the enclosing `<form action>`
  // is submitting, the button flips to the pending label, disables itself,
  // and reports aria-busy. We hold the action promise open so the pending
  // window is observable, then resolve it and assert it snaps back to idle.
  it("shows the pending label, disables, and reports aria-busy while the form action is in flight", async () => {
    let resolveAction: () => void = () => {};
    const action = () =>
      new Promise<void>((res) => {
        resolveAction = res;
      });

    act(() => {
      root.render(
        <form action={action}>
          <SubmitButton label="保存" pendingLabel="保存中..." />
        </form>,
      );
    });

    const form = container.querySelector("form");
    if (form === null) throw new Error("form not rendered");

    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });

    const pendingButton = getButton();
    expect(pendingButton.textContent).toBe("保存中...");
    expect(pendingButton.disabled).toBe(true);
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      resolveAction();
      await Promise.resolve();
      await Promise.resolve();
    });

    const idleButton = getButton();
    expect(idleButton.textContent).toBe("保存");
    expect(idleButton.disabled).toBe(false);
    expect(idleButton.getAttribute("aria-busy")).toBe("false");
  });
});
