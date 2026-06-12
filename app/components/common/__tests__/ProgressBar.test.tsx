// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProgressBar } from "../ProgressBar";

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

function getBar(): HTMLElement {
  const bar = container.querySelector<HTMLElement>('[role="progressbar"]');
  if (bar === null) throw new Error("progressbar not rendered");
  return bar;
}

describe("ProgressBar", () => {
  it("renders an indeterminate bar by default with no aria-valuenow", () => {
    act(() => {
      root.render(<ProgressBar />);
    });
    const bar = getBar();
    expect(bar.getAttribute("aria-busy")).toBe("true");
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.getAttribute("aria-label")).toBe("処理中");
  });

  it("guards the indeterminate animation with motion-safe", () => {
    act(() => {
      root.render(<ProgressBar />);
    });
    // The pulse is motion-safe only, so reduced motion shows a static fill.
    expect(getBar().innerHTML).toContain("motion-safe:animate-pulse");
  });

  it("reports aria-valuenow when a value is given (determinate)", () => {
    act(() => {
      root.render(<ProgressBar value={40} />);
    });
    const bar = getBar();
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-busy")).toBe("true");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });

  it("clamps out-of-range values and clears busy at 100", () => {
    act(() => {
      root.render(<ProgressBar value={150} />);
    });
    const bar = getBar();
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-busy")).toBe("false");
  });

  it("renders an aria-hidden bar with no progressbar role when decorative", () => {
    act(() => {
      root.render(<ProgressBar decorative />);
    });
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    const bar = container.querySelector<HTMLElement>("[aria-hidden]");
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
  });

  it("accepts a custom aria-label and className", () => {
    act(() => {
      root.render(<ProgressBar ariaLabel="アップロード中" className="mt-2" />);
    });
    const bar = getBar();
    expect(bar.getAttribute("aria-label")).toBe("アップロード中");
    expect(bar.className).toContain("mt-2");
  });
});
