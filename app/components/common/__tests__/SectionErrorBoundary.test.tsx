// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const invalidate = vi.fn(async (_opts?: unknown) => {});

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

const reportMock = vi.fn(async (_args?: unknown) => ({ ok: true }) as const);

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([[reportMock, reportMock]], reportMock),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../sectionFailureReport", () => ({
  reportSectionFailure: reportMock,
}));

const { SectionErrorBoundary } = await import("../SectionErrorBoundary");

let container: HTMLDivElement;
let root: Root;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  invalidate.mockClear();
  reportMock.mockClear();
  reportMock.mockResolvedValue({ ok: true });
  window.history.replaceState(null, "", "/notes");
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

  it("renders fallbackHeading above the alert so a page-level <h1> survives an error (#649 ADR-009)", () => {
    shouldThrow = true;
    act(() => {
      root.render(
        <SectionErrorBoundary
          section="ツールバー"
          fallbackHeading={<h1>すべてのノート</h1>}
        >
          <Child />
        </SectionErrorBoundary>,
      );
    });
    const h1 = container.querySelector("h1");
    if (h1 === null) throw new Error("fallback heading not rendered");
    expect(h1.textContent).toBe("すべてのノート");
    // The heading precedes the alert in document order.
    expect(
      h1.compareDocumentPosition(getAlert()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it("reports a section failure once with only the allowed keys when a child throws (#647 AC-1/AC-2)", () => {
    shouldThrow = true;
    window.history.replaceState(null, "", "/notes/abc");
    renderBoundary();

    expect(reportMock).toHaveBeenCalledTimes(1);
    const payload = (reportMock.mock.calls[0]?.[0] as { data: unknown }).data;
    // AC-2 negative assertion: only the four allowed keys, no redacted
    // error detail leaks into the report.
    expect(payload).toEqual({
      section: "ノート一覧",
      scope: "page",
      path: "/notes/abc",
      count: 1,
    });
    expect(Object.keys(payload as object).sort()).toEqual([
      "count",
      "path",
      "scope",
      "section",
    ]);
    expect(payload).not.toHaveProperty("message");
    expect(payload).not.toHaveProperty("stack");
    expect(payload).not.toHaveProperty("error");
  });

  it('defaults scope to "page" in the report when scope is unspecified (#647 arch S-004)', () => {
    shouldThrow = true;
    renderBoundary();
    const payload = (
      reportMock.mock.calls[0]?.[0] as { data: { scope: string } }
    ).data;
    expect(payload.scope).toBe("page");
  });

  it("increments count on the next catch when the boundary instance catches again (#647 AC-5)", () => {
    shouldThrow = true;
    renderBoundary(undefined, "q=a");
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(
      (reportMock.mock.calls[0]?.[0] as { data: { count: number } }).data.count,
    ).toBe(1);

    // A new resetKey clears the error state, the child throws again →
    // second catch, second send, count incremented.
    renderBoundary(undefined, "q=b");
    expect(reportMock).toHaveBeenCalledTimes(2);
    expect(
      (reportMock.mock.calls[1]?.[0] as { data: { count: number } }).data.count,
    ).toBe(2);
  });

  it("rolls up a retry-then-rethrow under the same resetKey to one send while count still increments (#647 arch S-002)", async () => {
    shouldThrow = true;
    renderBoundary(undefined, "q=a");
    // First catch → sent, count 1.
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(
      (reportMock.mock.calls[0]?.[0] as { data: { count: number } }).data.count,
    ).toBe(1);

    // Retry resets hasError → the child remounts and throws again under the
    // SAME resetKey. This exercises the real second `componentDidCatch`
    // (the bare re-render path keeps the fallback and never re-catches).
    // The send is deduped (lastReportedKey unchanged) so reportMock stays at
    // 1, but the internal catch counter still advances to 2.
    invalidate.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      getRetryButton().click();
    });
    expect(getAlert().textContent).toContain(
      "ノート一覧を読み込めませんでした",
    );
    expect(reportMock).toHaveBeenCalledTimes(1);

    // Changing the resetKey breaks dedup and forces a send. Its `count` is 3,
    // proving the deduped second catch above was still counted (1 → 2 deduped
    // → 3 sent), i.e. count is a catch counter, not a send counter.
    renderBoundary(undefined, "q=b");
    expect(reportMock).toHaveBeenCalledTimes(2);
    expect(
      (reportMock.mock.calls[1]?.[0] as { data: { count: number } }).data.count,
    ).toBe(3);
  });

  it("clamps an over-long section to exactly the schema max (100) in the report payload (#647 N-004)", () => {
    shouldThrow = true;
    const longSection = "あ".repeat(150);
    act(() => {
      root.render(
        <SectionErrorBoundary section={longSection}>
          <Child />
        </SectionErrorBoundary>,
      );
    });

    expect(reportMock).toHaveBeenCalledTimes(1);
    const payload = (
      reportMock.mock.calls[0]?.[0] as { data: { section: string } }
    ).data;
    // Exactly 100, not 99 or 101: a `.slice(0, 99)` / off-by-one mutation
    // must fail here, and the truncated prefix must match the input.
    expect(payload.section).toHaveLength(100);
    expect(payload.section).toBe(longSection.slice(0, 100));
  });

  it("clamps an over-long path to exactly the schema max (2048) in the report payload (#647 N-004)", () => {
    shouldThrow = true;
    const longPath = `/${"a".repeat(3000)}`;
    window.history.replaceState(null, "", longPath);
    renderBoundary();

    expect(reportMock).toHaveBeenCalledTimes(1);
    const payload = (
      reportMock.mock.calls[0]?.[0] as { data: { path: string } }
    ).data;
    // Exactly 2048: a `.slice(0, 2047)` / off-by-one mutation must fail here,
    // and the truncated prefix must match the actual pathname.
    expect(payload.path).toHaveLength(2048);
    expect(payload.path).toBe(window.location.pathname.slice(0, 2048));
  });

  it("keeps the fallback UI intact when the report send rejects (#647 AC-6)", () => {
    shouldThrow = true;
    reportMock.mockRejectedValueOnce(new Error("report sink down"));
    renderBoundary();

    expect(getAlert().textContent).toContain(
      "ノート一覧を読み込めませんでした",
    );
  });
});
