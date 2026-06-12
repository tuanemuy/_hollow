// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #219: pins the URL-only navigation contract introduced when the
 * home loader stopped tracking `display`. Two invariants are locked in:
 *
 * 1. `router.navigate` is called with `replace: true` so view-mode
 *    swaps do not pile onto the history stack.
 * 2. The `search` argument is a function that, given the previous
 *    search, returns a shape whose `display` matches the clicked mode.
 *    `loaderDeps` filtering happens upstream (the router will not
 *    re-run the loader because `display` is excluded), so the click
 *    handler itself only has to express the URL transition.
 *
 * The click handler synchronously invokes `router.navigate`, so the
 * test observes the call inside the same `act` tick as the click —
 * no `useTransition` indirection to wait on.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.fn().mockResolvedValue(undefined);
let currentDisplay: "list" | "tile" | "calendar" = "list";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: navigateMock }),
  getRouteApi: () => ({
    useSearch: <T,>({
      select,
    }: {
      select: (s: { display?: "list" | "tile" | "calendar" | undefined }) => T;
    }) => select({ display: currentDisplay }),
  }),
}));

const { DisplayModeSwitch } = await import("../DisplayModeSwitch");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  navigateMock.mockClear();
  currentDisplay = "list";
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

// Icon-only (#626 ADR-001) — tabs are identified by `aria-label`.
function tabByLabel(label: string): HTMLButtonElement {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  );
  const found = buttons.find((b) => b.getAttribute("aria-label") === label);
  if (found === undefined) {
    throw new Error(
      `tab "${label}" not found among [${buttons.map((b) => b.getAttribute("aria-label")).join(", ")}]`,
    );
  }
  return found;
}

describe("DisplayModeSwitch", () => {
  it("keeps the icon-only aria contract (#626 ADR-001): tablist / tab / aria-selected / aria-label / title, no visible text", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist?.getAttribute("aria-label")).toBe("表示形式");

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual([
      "リスト",
      "タイル",
      "カレンダー",
    ]);
    for (const tab of tabs) {
      expect(tab.getAttribute("title")).toBe(tab.getAttribute("aria-label"));
      // Icon-only: the accessible name comes from aria-label, not text.
      expect(tab.textContent).toBe("");
      expect(tab.querySelector("svg")).not.toBeNull();
    }
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
  });

  it("navigates with replace: true and a function search returning the clicked mode", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    act(() => {
      tabByLabel("タイル").click();
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      replace: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.to).toBe("/");
    expect(call.replace).toBe(true);
    expect(typeof call.search).toBe("function");

    const prev = { page: 1, limit: 30, q: "hello" } as const;
    const next = call.search(prev);
    expect(next).toEqual({ page: 1, limit: 30, q: "hello", display: "tile" });
  });

  it("does not navigate when the clicked mode equals the current mode", () => {
    currentDisplay = "tile";
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    act(() => {
      tabByLabel("タイル").click();
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("forwards the calendar mode through the search function (Issue #215)", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    act(() => {
      tabByLabel("カレンダー").click();
    });

    const call = navigateMock.mock.calls[0]?.[0] as {
      replace: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.replace).toBe(true);
    // Issue #215: empty prev → no `page` / `limit` added to the search
    // payload so the URL stays clean. The home schema leaves the fields
    // optional on its output and the loader re-defaults at the boundary.
    const next = call.search({});
    expect(next).toEqual({ display: "calendar" });
  });

  it("preserves non-default `prev` while swapping `display` (Issue #215)", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    act(() => {
      tabByLabel("カレンダー").click();
    });

    const call = navigateMock.mock.calls[0]?.[0] as {
      replace: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    // Issue #215: prev pass-through — user-supplied `page` / `limit`
    // and other filters must survive the display switch so the URL
    // still reflects the active state after the swap.
    const next = call.search({ page: 2, limit: 30, q: "world" });
    expect(next).toEqual({
      page: 2,
      limit: 30,
      q: "world",
      display: "calendar",
    });
  });
});
