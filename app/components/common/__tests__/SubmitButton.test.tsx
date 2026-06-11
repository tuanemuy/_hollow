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
});
