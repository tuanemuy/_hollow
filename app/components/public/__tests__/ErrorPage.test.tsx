// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorPageKind } from "../ErrorPage";

/**
 * Issue #546: P34 variant-specific actions + the all-variants「一つ前に戻る」
 * back link. 404=home+search, 403=login+home, 410=home, 500=reload+home; the
 * search box stays notFound/gone-only (regression).
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { back } = vi.hoisted(() => ({ back: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ history: { back } }),
}));

vi.mock("../PublicLayout", () => ({
  PublicLayout: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { ErrorPage } = await import("../ErrorPage");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  back.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(kind: ErrorPageKind) {
  act(() => {
    root.render(<ErrorPage kind={kind} />);
  });
}

function buttons() {
  return Array.from(container.querySelectorAll("button"));
}

function links() {
  return Array.from(container.querySelectorAll("a"));
}

function backLink(): HTMLButtonElement | undefined {
  return buttons().find((b) => b.textContent?.includes("一つ前に戻る"));
}

describe("ErrorPage back link (Issue #546)", () => {
  it.each<ErrorPageKind>([
    "notFound",
    "forbidden",
    "gone",
    "system",
  ])("renders the back link on the %s variant and wires history.back()", (kind) => {
    render(kind);
    const link = backLink();
    expect(link).toBeDefined();
    act(() => {
      link?.click();
    });
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorPage variant actions (Issue #546)", () => {
  it("404: primary home + secondary search + search box", () => {
    render("notFound");
    const home = links().find((a) => a.textContent?.includes("ホームへ戻る"));
    expect(home?.getAttribute("data-primary")).toBe("");
    expect(
      links().some((a) => a.textContent?.includes("検索ページを開く")),
    ).toBe(true);
    expect(container.querySelector("search")).not.toBeNull();
  });

  it("403: primary login + secondary home, no search box", () => {
    render("forbidden");
    const login = links().find((a) => a.getAttribute("href") === "/login");
    expect(login).toBeDefined();
    expect(login?.getAttribute("data-primary")).toBe("");
    const home = links().find((a) => a.textContent?.includes("ホームへ戻る"));
    expect(home).toBeDefined();
    expect(home?.getAttribute("data-primary")).toBeNull();
    expect(container.querySelector("search")).toBeNull();
  });

  it("410: primary home only + search box", () => {
    render("gone");
    const home = links().find((a) => a.textContent?.includes("ホームへ戻る"));
    expect(home?.getAttribute("data-primary")).toBe("");
    expect(
      links().some((a) => a.textContent?.includes("検索ページを開く")),
    ).toBe(false);
    expect(container.querySelector("search")).not.toBeNull();
  });

  it("500: primary reload (client) + secondary home, no search box", () => {
    render("system");
    const reload = buttons().find((b) => b.textContent?.includes("再読み込み"));
    expect(reload).toBeDefined();
    expect(reload?.getAttribute("data-primary")).toBe("");
    const home = links().find((a) => a.textContent?.includes("ホームへ戻る"));
    expect(home?.getAttribute("data-primary")).toBeNull();
    expect(container.querySelector("search")).toBeNull();
  });
});
