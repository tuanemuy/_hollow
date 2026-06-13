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
 *
 * Issue #650: select now also writes the chosen mode to localStorage
 * (`hollow3:noteList:display`). `useEffectiveDisplayMode` runs as real
 * code here; the navigate guard is driven by the raw URL value while the
 * active-tab state is driven by the effective mode, so the two concerns
 * are exercised separately (ADR-005). localStorage is the real happy-dom
 * store, cleared between tests.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.fn().mockResolvedValue(undefined);
let currentDisplay: "list" | "tile" | "calendar" | undefined = "list";

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

const DISPLAY_KEY = "hollow3:noteList:display";

beforeEach(() => {
  navigateMock.mockClear();
  currentDisplay = "list";
  window.localStorage.clear();
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

  it("does not navigate when the clicked mode equals the URL display value", () => {
    currentDisplay = "tile";
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    act(() => {
      tabByLabel("タイル").click();
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("still writes to localStorage on the early-return path (Issue #650 ADR-005)", () => {
    // The clicked mode equals the raw URL display value, so the navigate
    // guard early-returns. `writeDisplayPreference(mode)` runs BEFORE that
    // guard, so re-clicking the current mode still re-persists it. This pins
    // the write-before-guard ordering against a refactor that moves the
    // guard ahead of the write (which would drop the write on re-click).
    currentDisplay = "tile";
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    act(() => {
      tabByLabel("タイル").click();
    });

    expect(navigateMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DISPLAY_KEY)).toBe("tile");
  });

  it("writes the selected mode to localStorage on select (Issue #650 AC-1)", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    act(() => {
      tabByLabel("カレンダー").click();
    });

    expect(window.localStorage.getItem(DISPLAY_KEY)).toBe("calendar");
  });

  it("navigates when the URL has no display even if a persisted value matches the click (Issue #650 ADR-005)", () => {
    // URL has no `?display=` (raw value undefined) but localStorage holds
    // `calendar`. Clicking calendar must still navigate to pin the choice
    // on the URL — the guard is on the raw URL value, not the effective
    // (persisted) mode.
    currentDisplay = undefined;
    window.localStorage.setItem(DISPLAY_KEY, "calendar");
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    act(() => {
      tabByLabel("カレンダー").click();
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it("marks the active tab from the effective mode: URL has no display but persisted calendar makes the calendar tab aria-selected after mount (Issue #650 ADR-005)", () => {
    // Concern (B): the active tab follows the EFFECTIVE mode (persisted-value
    // overlay), not the raw URL value. With no `?display=` (raw URL value
    // undefined) but localStorage holding `calendar`, the segmented control's
    // active tab must end up on calendar — matching what `NoteListViews`
    // renders — so the user is not shown "list active" while the page renders
    // calendar. This is the pair to the navigate-guard test above, which pins
    // concern (A) on the raw URL value. A regression that wired `current` to
    // the raw URL value (or re-added `?? "list"`) would leave list active
    // here and this test would catch it.
    currentDisplay = undefined;
    window.localStorage.setItem(DISPLAY_KEY, "calendar");
    // A single `act(render)` flushes both the commit and the mount
    // `useEffect`, so by the time it returns `useEffectiveDisplayMode` has
    // already applied the persisted `calendar` (the first-render `"list"`
    // that keeps hydration parity is internal to the hook and not separately
    // observable through the DOM after the effect runs — it is pinned by
    // `useEffectiveDisplayMode.test.tsx` via a per-render probe).
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    expect(tabByLabel("カレンダー").getAttribute("aria-selected")).toBe("true");
    expect(tabByLabel("リスト").getAttribute("aria-selected")).toBe("false");
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
