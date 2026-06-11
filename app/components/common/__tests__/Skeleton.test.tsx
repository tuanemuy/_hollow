// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Skeleton } from "../Skeleton";

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

describe("Skeleton", () => {
  it("renders a status region with the default aria-label", () => {
    act(() => {
      root.render(<Skeleton />);
    });
    const status = getStatus();
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("読み込み中");
  });

  it("suppresses the default aria-label when a visible label is rendered", () => {
    act(() => {
      root.render(<Skeleton label="読み込み中..." />);
    });
    expect(getStatus().getAttribute("aria-label")).toBeNull();
  });

  it("keeps an explicit ariaLabel even when a label is rendered", () => {
    act(() => {
      root.render(
        <Skeleton label="読み込み中..." ariaLabel="一覧を読み込み中" />,
      );
    });
    expect(getStatus().getAttribute("aria-label")).toBe("一覧を読み込み中");
  });

  it("renders the requested number of (aria-hidden) bars", () => {
    act(() => {
      root.render(<Skeleton bars={4} />);
    });
    const bars = getStatus().querySelectorAll('[aria-hidden="true"]');
    expect(bars).toHaveLength(4);
  });

  it("guards the bar pulse with motion-safe", () => {
    act(() => {
      root.render(<Skeleton bars={1} />);
    });
    const bar = getStatus().querySelector<HTMLElement>('[aria-hidden="true"]');
    if (bar === null) throw new Error("skeleton bar not rendered");
    expect(bar.className).toContain("motion-safe:animate-pulse");
  });

  it("renders one bar per width when bars is an array", () => {
    act(() => {
      root.render(<Skeleton bars={["w-3/4", "w-1/2"]} />);
    });
    const bars = getStatus().querySelectorAll('[aria-hidden="true"]');
    expect(bars).toHaveLength(2);
  });

  it("renders the label and sublabel text", () => {
    act(() => {
      root.render(
        <Skeleton label="読み込み中..." sublabel="少々お待ちください" />,
      );
    });
    const text = getStatus().textContent ?? "";
    expect(text).toContain("読み込み中...");
    expect(text).toContain("少々お待ちください");
  });
});
