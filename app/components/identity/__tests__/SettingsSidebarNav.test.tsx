// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Map TanStack's `to` prop to a plain anchor `href` so the back link's
// destination is assertable in a DOM-only test.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    activeProps: _activeProps,
    search: _search,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    activeProps?: unknown;
    search?: unknown;
    [key: string]: unknown;
  }) => (
    <a href={to} {...(rest as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));

const { SettingsSidebarNav } = await import("../SettingsSidebarNav");

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

function render() {
  act(() => {
    root.render(<SettingsSidebarNav />);
  });
}

describe("SettingsSidebarNav back link", () => {
  it("renders a 'すべてのノートに戻る' link pointing at home (/)", () => {
    render();
    const link = Array.from(container.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("すべてのノートに戻る"),
    );
    expect(link).toBeDefined();
    expect(link?.getAttribute("href")).toBe("/");
  });
});
