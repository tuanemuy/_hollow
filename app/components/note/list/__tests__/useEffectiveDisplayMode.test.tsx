// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #650: the effective display mode resolves
 * URL `?display=` > persisted value > default `"list"`, and never reads
 * localStorage during the first (hydration-matching) render.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let currentDisplay: "list" | "tile" | "calendar" | undefined;

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useSearch: <T,>({
      select,
    }: {
      select: (s: { display?: "list" | "tile" | "calendar" | undefined }) => T;
    }) => select({ display: currentDisplay }),
  }),
}));

const KEY = "hollow3:noteList:display";

const { useEffectiveDisplayMode } = await import("../useEffectiveDisplayMode");

let container: HTMLDivElement;
let root: Root;
const observed: string[] = [];

function Probe() {
  const mode = useEffectiveDisplayMode();
  observed.push(mode);
  return <div data-mode={mode} />;
}

function currentMode(): string | null {
  return (
    container.querySelector("[data-mode]")?.getAttribute("data-mode") ?? null
  );
}

beforeEach(() => {
  currentDisplay = undefined;
  observed.length = 0;
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
  window.localStorage.clear();
});

describe("useEffectiveDisplayMode", () => {
  it("returns the URL value and ignores the persisted value (AC-3)", () => {
    currentDisplay = "tile";
    window.localStorage.setItem(KEY, "calendar");
    act(() => {
      root.render(<Probe />);
    });
    expect(currentMode()).toBe("tile");
  });

  it("applies the persisted value after mount when the URL has none (AC-2)", () => {
    currentDisplay = undefined;
    window.localStorage.setItem(KEY, "calendar");
    act(() => {
      root.render(<Probe />);
    });
    // First render matched the server default before the effect ran.
    expect(observed[0]).toBe("list");
    // After mount the persisted value takes over.
    expect(currentMode()).toBe("calendar");
  });

  it("renders the default 'list' on the first render for hydration parity (AC-6)", () => {
    currentDisplay = undefined;
    window.localStorage.setItem(KEY, "tile");
    act(() => {
      root.render(<Probe />);
    });
    expect(observed[0]).toBe("list");
  });

  it("falls back to 'list' when neither URL nor persisted value is set", () => {
    currentDisplay = undefined;
    act(() => {
      root.render(<Probe />);
    });
    expect(currentMode()).toBe("list");
  });
});
