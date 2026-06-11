// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionErrorBoundary } from "../SectionErrorBoundary";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const invalidate = vi.fn(async (_opts?: unknown) => {});

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

let container: HTMLDivElement;
let root: Root;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  invalidate.mockClear();
  // React logs boundary-caught errors; keep test output clean.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  consoleError.mockRestore();
});

let shouldThrow = true;

function Child() {
  if (shouldThrow) throw new Error("boom");
  return <p>recovered</p>;
}

function renderBoundary(scope?: "page" | "shell", resetKey?: string | number) {
  act(() => {
    root.render(
      <SectionErrorBoundary
        section="ノート一覧"
        {...(scope !== undefined ? { scope } : {})}
        {...(resetKey !== undefined ? { resetKey } : {})}
      >
        <Child />
      </SectionErrorBoundary>,
    );
  });
}

function getAlert(): HTMLElement {
  const alert = container.querySelector<HTMLElement>('[role="alert"]');
  if (alert === null) throw new Error("alert fallback not rendered");
  return alert;
}

function getRetryButton(): HTMLButtonElement {
  const button = getAlert().querySelector<HTMLButtonElement>("button");
  if (button === null) throw new Error("retry button not rendered");
  return button;
}

describe("SectionErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    shouldThrow = false;
    renderBoundary();
    expect(container.textContent).toContain("recovered");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows a role=alert fallback with the section name when a child throws", () => {
    shouldThrow = true;
    renderBoundary();
    expect(getAlert().textContent).toContain(
      "ノート一覧を読み込めませんでした",
    );
  });

  it("invalidates the router (excluding _app) and resets on retry", async () => {
    shouldThrow = true;
    renderBoundary();

    shouldThrow = false;
    await act(async () => {
      getRetryButton().click();
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    const opts = invalidate.mock.calls[0]?.[0] as {
      filter: (match: { routeId: string }) => boolean;
    };
    expect(opts.filter({ routeId: "/_app" })).toBe(false);
    expect(opts.filter({ routeId: "/_app/" })).toBe(true);
    expect(container.textContent).toContain("recovered");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("targets only the _app shell when scope is shell", async () => {
    shouldThrow = true;
    renderBoundary("shell");

    shouldThrow = false;
    await act(async () => {
      getRetryButton().click();
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    const opts = invalidate.mock.calls[0]?.[0] as {
      filter: (match: { routeId: string }) => boolean;
    };
    expect(opts.filter({ routeId: "/_app" })).toBe(true);
    expect(opts.filter({ routeId: "/_app/" })).toBe(false);
  });

  it("clears the error state when resetKey changes (#636 FE-W-001)", () => {
    shouldThrow = true;
    renderBoundary(undefined, "q=a");
    expect(getAlert()).toBeTruthy();

    shouldThrow = false;
    renderBoundary(undefined, "q=b");

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("recovered");
  });

  it("keeps the error state when resetKey is unchanged", () => {
    shouldThrow = true;
    renderBoundary(undefined, "q=a");

    shouldThrow = false;
    renderBoundary(undefined, "q=a");

    expect(getAlert().textContent).toContain(
      "ノート一覧を読み込めませんでした",
    );
  });

  it("renders the pending spinner as decorative during retry (#636 TS-W-003)", async () => {
    shouldThrow = true;
    let resolveInvalidate: (() => void) | undefined;
    invalidate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInvalidate = resolve;
        }),
    );
    renderBoundary();

    shouldThrow = false;
    await act(async () => {
      getRetryButton().click();
    });

    const spinner = getRetryButton().querySelector("span");
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner?.getAttribute("role")).toBeNull();

    await act(async () => {
      resolveInvalidate?.();
    });
  });

  it("keeps the fallback when invalidation rejects", async () => {
    shouldThrow = true;
    invalidate.mockRejectedValueOnce(new Error("offline"));
    renderBoundary();

    await act(async () => {
      getRetryButton().click();
    });

    // The boundary resets but the child throws again, so the fallback stays.
    expect(getAlert().textContent).toContain(
      "ノート一覧を読み込めませんでした",
    );
  });
});
