// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { RetryableError } from "../RetryableError";

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

function getAlert(): HTMLElement {
  const alert = container.querySelector<HTMLElement>('[role="alert"]');
  if (alert === null) throw new Error("alert not rendered");
  return alert;
}

function getRetryButton(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>("button[type='button']");
}

const systemError: SerializedError = {
  kind: "system",
  code: null,
  message: "boom",
};
const forbiddenError: SerializedError = {
  kind: "forbidden",
  code: null,
  message: "no",
  retryable: false,
};

describe("RetryableError", () => {
  it("renders the displayed error message in a role=alert region", () => {
    act(() => {
      root.render(<RetryableError error={systemError} />);
    });
    expect(getAlert().textContent).toContain("システムエラーが発生しました");
  });

  it("shows no retry button when onRetry is omitted", () => {
    act(() => {
      root.render(<RetryableError error={systemError} />);
    });
    expect(getRetryButton()).toBeNull();
  });

  it("shows a retry button when onRetry is provided for a retryable error", () => {
    const onRetry = vi.fn();
    act(() => {
      root.render(<RetryableError error={systemError} onRetry={onRetry} />);
    });
    const button = getRetryButton();
    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("suppresses the retry button for non-retryable (fatal) errors even with onRetry", () => {
    act(() => {
      root.render(<RetryableError error={forbiddenError} onRetry={() => {}} />);
    });
    expect(getRetryButton()).toBeNull();
  });

  it("disables the button and sets aria-busy while retrying", () => {
    act(() => {
      root.render(
        <RetryableError error={systemError} onRetry={() => {}} isRetrying />,
      );
    });
    const button = getRetryButton();
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-busy")).toBe("true");
  });
});
