// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let queueCount = 0;

vi.mock("@/components/ingestion/useIngestionQueueCount", () => ({
  useIngestionQueueCount: () => queueCount,
  uploadQueueLabel: (count: number) =>
    count > 0 ? `アップロード（未処理 ${count} 件）` : "アップロード",
}));

// `UploadNavItem` delegates active state to the declarative `activeProps`
// (unlike `UploadButton`, which computes it imperatively from `useLocation`).
// The mock must therefore spread `activeProps` onto the anchor when active, or
// the `data-active` / `aria-current` coexistence assertion would silently pass
// on a never-rendered attribute.
let linkActive = false;

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    activeProps,
    ...rest
  }: {
    children: React.ReactNode;
    activeProps?: Record<string, unknown>;
    [key: string]: unknown;
  }) => (
    <a
      {...(rest as Record<string, unknown>)}
      {...(linkActive ? (activeProps ?? {}) : {})}
    >
      {children}
    </a>
  ),
}));

const { UploadNavItem } = await import("../UploadNavItem");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  queueCount = 0;
  linkActive = false;
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

function render() {
  act(() => {
    root.render(<UploadNavItem />);
  });
}

const anchor = () => container.querySelector("a");
const countSpan = () => container.querySelector("a > span:last-child");

describe("UploadNavItem", () => {
  it("shows the visible count and a count-aware aria-label when count > 0", () => {
    queueCount = 3;
    render();

    expect(countSpan()?.textContent).toBe("3");
    expect(anchor()?.getAttribute("aria-label")).toBe(
      "アップロード（未処理 3 件）",
    );
  });

  it("hides the visible count and uses the plain aria-label at 0", () => {
    queueCount = 0;
    render();

    // Only the label span remains; no second (count) span.
    expect(container.querySelectorAll("a > span")).toHaveLength(1);
    expect(anchor()?.getAttribute("aria-label")).toBe("アップロード");
  });

  it("caps the visible count at 99+", () => {
    queueCount = 120;
    render();

    expect(countSpan()?.textContent).toBe("99+");
    expect(anchor()?.getAttribute("aria-label")).toBe(
      "アップロード（未処理 120 件）",
    );
  });

  it("coexists with activeProps (data-active / aria-current) when active", () => {
    queueCount = 2;
    linkActive = true;
    render();

    expect(anchor()?.getAttribute("data-active")).toBe("");
    expect(anchor()?.getAttribute("aria-current")).toBe("page");
    // The label still carries the count alongside the active state.
    expect(anchor()?.getAttribute("aria-label")).toBe(
      "アップロード（未処理 2 件）",
    );
  });
});
