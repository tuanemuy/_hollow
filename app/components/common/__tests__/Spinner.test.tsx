// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Spinner } from "../Spinner";

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

function getStatus(): HTMLElement {
  const status = container.querySelector<HTMLElement>('[role="status"]');
  if (status === null) throw new Error("status region not rendered");
  return status;
}

describe("Spinner", () => {
  it("renders a status region with the default aria-label", () => {
    act(() => {
      root.render(<Spinner />);
    });
    expect(getStatus().getAttribute("aria-label")).toBe("読み込み中");
  });

  it("guards the spin with motion-safe", () => {
    act(() => {
      root.render(<Spinner />);
    });
    expect(getStatus().className).toContain("motion-safe:animate-spin");
  });

  it("accepts a custom aria-label and className", () => {
    act(() => {
      root.render(<Spinner ariaLabel="送信中" className="text-accent" />);
    });
    const status = getStatus();
    expect(status.getAttribute("aria-label")).toBe("送信中");
    expect(status.className).toContain("text-accent");
  });
});
