// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #300: pins the retry-button contract of `AppErrorFallback`.
 * The component is the W-P-002 fix — when `_app.loader` throws, the
 * frame surrounding it gets replaced, and the user needs a deterministic
 * way to re-evaluate only `_app` (not the leaf, which is already
 * unmounted) without bouncing the whole router state.
 *
 * The flow under test:
 *   1. button is initially enabled
 *   2. click → `useTransition` flips `isPending=true` → button gets
 *      `disabled` + `aria-busy="true"`
 *   3. `appShellInvalidate(router)` is invoked exactly once via the
 *      `_app`-only filter (indirect proof of helper delegation)
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const invalidateMock = vi.fn().mockResolvedValue(undefined);
const routerStub = { invalidate: invalidateMock };

// Preserve the rest of the module (`createFileRoute`, etc.) so that
// importing `app/routes/_app/route.tsx` does not blow up when it
// constructs `Route` at module load time.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouter: () => routerStub,
  };
});

// Keep the error-display branch deterministic regardless of the
// `sanitizeRouteError` runtime behaviour.
vi.mock("@/core/presentation/errorDisplay", () => ({
  sanitizeRouteError: (e: unknown) => `sanitised:${String(e)}`,
}));

const { AppErrorFallback } = await import("../route");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  invalidateMock.mockClear();
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

function getRetryButton(): HTMLButtonElement {
  const button = container.querySelector(
    "button[type='button']",
  ) as HTMLButtonElement | null;
  if (button === null) throw new Error("retry button not found");
  return button;
}

describe("AppErrorFallback", () => {
  it("renders the sanitised error and an enabled retry button", () => {
    act(() => {
      root.render(<AppErrorFallback error={new Error("boom")} />);
    });
    const text = container.querySelector("pre")?.textContent ?? "";
    expect(text).toContain("sanitised:");
    const button = getRetryButton();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("invokes appShellInvalidate with the `_app`-only filter on retry click", async () => {
    act(() => {
      root.render(<AppErrorFallback error={new Error("boom")} />);
    });
    await act(async () => {
      getRetryButton().click();
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    const filter = invalidateMock.mock.calls[0]?.[0]?.filter as
      | ((m: { routeId: string }) => boolean)
      | undefined;
    expect(filter?.({ routeId: "/_app" })).toBe(true);
    expect(filter?.({ routeId: "/_app/notes" })).toBe(false);
    expect(filter?.({ routeId: "/login" })).toBe(false);
  });

  it("does not double-invoke on rapid repeat clicks while pending", async () => {
    // The router stub resolves immediately so `isPending` flips back
    // synchronously between acts. We control timing by withholding
    // resolution via a manual promise.
    let resolveInvalidate: (() => void) | null = null;
    invalidateMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInvalidate = resolve;
        }),
    );

    act(() => {
      root.render(<AppErrorFallback error={new Error("boom")} />);
    });

    // First click triggers invalidate but pending stays high until
    // the promise resolves.
    await act(async () => {
      getRetryButton().click();
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(getRetryButton().disabled).toBe(true);
    expect(getRetryButton().getAttribute("aria-busy")).toBe("true");

    // A second click while disabled must not enqueue another call.
    await act(async () => {
      getRetryButton().click();
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);

    // Resolve the original promise — the button should re-enable.
    await act(async () => {
      resolveInvalidate?.();
    });
    expect(getRetryButton().disabled).toBe(false);
  });
});
