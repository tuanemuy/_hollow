// @vitest-environment happy-dom

/**
 * Issue #819: the global route-transition bar reflects the router's
 * `isLoading` synchronously and is purely decorative. This pins:
 * - `isLoading=true` marks the bar loading (`data-loading`) so it becomes
 *   visible regardless of preload state (AC-1/AC-3);
 * - `isLoading=false` drops the attribute so the bar fades out;
 * - the bar is `aria-hidden` with no `role`/`aria-live` (load announcements
 *   live on the page skeletons, not here — ADR-002).
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let currentIsLoading = false;

vi.mock("@tanstack/react-router", () => ({
  useRouterState: <T,>({
    select,
  }: {
    select: (s: { isLoading: boolean }) => T;
  }) => select({ isLoading: currentIsLoading }),
}));

const { RouteProgressBar } = await import("../RouteProgressBar");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  currentIsLoading = false;
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

function barEl(): HTMLElement | null {
  return container.firstElementChild as HTMLElement | null;
}

describe("RouteProgressBar", () => {
  it("marks the bar loading while isLoading=true", () => {
    currentIsLoading = true;
    act(() => {
      root.render(<RouteProgressBar />);
    });
    const bar = barEl();
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("data-loading")).toBe("true");
  });

  it("drops the loading attribute while isLoading=false", () => {
    currentIsLoading = false;
    act(() => {
      root.render(<RouteProgressBar />);
    });
    expect(barEl()?.hasAttribute("data-loading")).toBe(false);
  });

  it("is decorative: aria-hidden, no role / aria-live", () => {
    currentIsLoading = true;
    act(() => {
      root.render(<RouteProgressBar />);
    });
    const bar = barEl();
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
    expect(bar?.hasAttribute("role")).toBe(false);
    expect(bar?.hasAttribute("aria-live")).toBe(false);
    // No announcing region anywhere in the subtree.
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  // AC-6: reduced-motion must reduce the animation to 0ms-equivalent. happy-dom
  // cannot evaluate the media query, so — as `ProgressBar.test.tsx` /
  // `Skeleton.test.tsx` do — pin the class contract instead: the bar shows
  // instantly (`data-[loading]:transition-none`) and drops the fade under
  // reduced motion (`motion-reduce:transition-none`), and its fill's
  // indeterminate pulse is `motion-safe:` (static under reduced motion). If a
  // refactor drops any of these, AC-6 breaks silently otherwise.
  it("pins the reduced-motion class contract (AC-6)", () => {
    act(() => {
      root.render(<RouteProgressBar />);
    });
    const bar = barEl();
    const barClass = bar?.className ?? "";
    expect(barClass).toContain("motion-reduce:transition-none");
    expect(barClass).toContain("data-[loading]:transition-none");

    const fill = bar?.firstElementChild as HTMLElement | null;
    expect(fill?.className ?? "").toContain("motion-safe:animate-pulse");
  });
});
