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

// Icon-only (#626 ADR-001) — radios are identified by `aria-label`.
function tabByLabel(label: string): HTMLButtonElement {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  );
  const found = buttons.find((b) => b.getAttribute("aria-label") === label);
  if (found === undefined) {
    throw new Error(
      `radio "${label}" not found among [${buttons.map((b) => b.getAttribute("aria-label")).join(", ")}]`,
    );
  }
  return found;
}

function pressKey(key: string): void {
  const group = container.querySelector('[role="radiogroup"]');
  act(() => {
    group?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("DisplayModeSwitch", () => {
  it("keeps the icon-only aria contract (#626 ADR-001 / #660): radiogroup / radio / aria-checked / aria-label / title, no visible text", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    const group = container.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(group?.getAttribute("aria-label")).toBe("表示形式");
    // #660: the APG Tabs markup is fully replaced — no tablist/tab/aria-selected.
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector("[aria-selected]")).toBeNull();

    const radios = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    expect(radios.map((t) => t.getAttribute("aria-label"))).toEqual([
      "リスト",
      "タイル",
      "カレンダー",
    ]);
    for (const radio of radios) {
      expect(radio.getAttribute("title")).toBe(
        radio.getAttribute("aria-label"),
      );
      // Icon-only: the accessible name comes from aria-label, not text.
      expect(radio.textContent).toBe("");
      expect(radio.querySelector("svg")).not.toBeNull();
    }
    expect(radios.map((t) => t.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    // Roving tabindex: only the checked radio is tabbable (#660 AC-2).
    expect(radios.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
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

    expect(tabByLabel("カレンダー").getAttribute("aria-checked")).toBe("true");
    expect(tabByLabel("リスト").getAttribute("aria-checked")).toBe("false");
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

  // #660: APG Radio Group roving — Arrow / Home / End move focus AND select
  // (navigate replace:true), wrapping at both ends. The select logic is the
  // same `select` handler the click path uses, so the existing navigate/
  // localStorage contracts above hold; these pin the keyboard wiring.
  it("ArrowRight moves selection to the next mode and navigates (replace: true)", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    pressKey("ArrowRight");

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0]?.[0] as {
      replace: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.replace).toBe(true);
    expect(call.search({})).toEqual({ display: "tile" });
    // Roving focus follows the move: focus lands on the next radio (#660 W-001).
    expect(document.activeElement).toBe(tabByLabel("タイル"));
  });

  it("ArrowDown behaves like ArrowRight: moves to the next mode and navigates", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    pressKey("ArrowDown");

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(
      (
        navigateMock.mock.calls[0]?.[0] as {
          search: (p: Record<string, unknown>) => Record<string, unknown>;
        }
      ).search({}),
    ).toEqual({ display: "tile" });
  });

  it("ArrowUp behaves like ArrowLeft: from list wraps to calendar (last)", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    pressKey("ArrowUp");

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(
      (
        navigateMock.mock.calls[0]?.[0] as {
          search: (p: Record<string, unknown>) => Record<string, unknown>;
        }
      ).search({}),
    ).toEqual({ display: "calendar" });
  });

  it("ArrowLeft from list wraps to calendar (last) and navigates", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    pressKey("ArrowLeft");

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0]?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.search({})).toEqual({ display: "calendar" });
  });

  it("Home jumps to the first mode and End to the last", () => {
    currentDisplay = "tile";
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    pressKey("End");
    expect(
      (
        navigateMock.mock.calls[0]?.[0] as {
          search: (p: Record<string, unknown>) => Record<string, unknown>;
        }
      ).search({}),
    ).toEqual({ display: "calendar" });
    // Roving focus follows End to the last radio (#660 W-001).
    expect(document.activeElement).toBe(tabByLabel("カレンダー"));

    pressKey("Home");
    // Home from tile selects list (index 0); `homeSearchUpdater` overlays the
    // patch onto prev, so `display: "list"` is carried explicitly.
    expect(
      (
        navigateMock.mock.calls[1]?.[0] as {
          search: (p: Record<string, unknown>) => Record<string, unknown>;
        }
      ).search({}),
    ).toEqual({ display: "list" });
    // Roving focus follows Home to the first radio (#660 W-001).
    expect(document.activeElement).toBe(tabByLabel("リスト"));
  });

  it("fires a navigate per arrow press for consecutive arrows (replace: true each)", () => {
    // The component reads `current` from the (mocked) URL value, which does not
    // change between presses here, so each ArrowRight steps from `list` → next
    // index relative to the same baseline. The point of this regression is that
    // every keypress drives its own navigate (no swallowing / debounce) with
    // `replace: true`, matching the click path.
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    pressKey("ArrowRight");
    pressKey("ArrowRight");

    expect(navigateMock).toHaveBeenCalledTimes(2);
    for (const call of navigateMock.mock.calls) {
      expect((call[0] as { replace: boolean }).replace).toBe(true);
    }
    expect(
      (
        navigateMock.mock.calls[0]?.[0] as {
          search: (p: Record<string, unknown>) => Record<string, unknown>;
        }
      ).search({}),
    ).toEqual({ display: "tile" });
  });

  it("only the checked radio is tabbable; the rest carry tabIndex -1 (#660 AC-2)", () => {
    currentDisplay = "calendar";
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    expect(tabByLabel("カレンダー").tabIndex).toBe(0);
    expect(tabByLabel("リスト").tabIndex).toBe(-1);
    expect(tabByLabel("タイル").tabIndex).toBe(-1);
  });

  it("does not preventDefault on unhandled keys, leaving Tab to move focus away", () => {
    act(() => {
      root.render(<DisplayModeSwitch />);
    });

    const group = container.querySelector('[role="radiogroup"]');
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    act(() => {
      group?.dispatchEvent(event);
    });

    // Unhandled keys are passed through: no preventDefault, no navigate.
    expect(event.defaultPrevented).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
