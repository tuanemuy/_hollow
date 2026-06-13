// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavior contract for the note-detail breadcrumb (Issue #672):
 *
 *  - The fixed "すべてのノート" starting link is gone — it must never render.
 *  - The separator (›) appears *between* elements only, never before the
 *    first one, so N display elements yield N-1 separators.
 *  - A root-level note (empty `segments`) shows just the title, no separator.
 *  - Each directory segment remains a `directoryId`-scoped home-list link.
 *
 * `Link` is mocked as an anchor that exposes its `to`/`search` props as
 * attributes so the scoped-filter contract can be asserted. Separators are
 * the only `aria-hidden` spans, so they are counted via that selector.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children?: React.ReactNode;
    to?: string;
    search?: unknown;
  }) => (
    <a href={to} data-to={to} data-search={JSON.stringify(search)}>
      {children}
    </a>
  ),
}));

const { NoteBreadcrumb } = await import("../NoteBreadcrumb");

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

function separators(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'),
  );
}

describe("NoteBreadcrumb (Issue #672)", () => {
  it("never renders the すべてのノート starting link", () => {
    act(() => {
      root.render(
        <NoteBreadcrumb
          segments={[{ id: "d1", name: "Research" }]}
          noteTitle="My Note"
        />,
      );
    });
    expect(container.textContent).not.toContain("すべてのノート");
  });

  it("never renders すべてのノート for a root-level note either", () => {
    act(() => {
      root.render(<NoteBreadcrumb segments={[]} noteTitle="Root Note" />);
    });
    expect(container.textContent).not.toContain("すべてのノート");
  });

  it("renders seg › seg › title with no leading separator", () => {
    act(() => {
      root.render(
        <NoteBreadcrumb
          segments={[
            { id: "d1", name: "Research" },
            { id: "d2", name: "論文メモ" },
          ]}
          noteTitle="My Note"
        />,
      );
    });

    const nav = container.querySelector('nav[aria-label="パンくず"]');
    if (nav === null) throw new Error("breadcrumb nav not found");

    // Text order of the three display elements.
    const links = Array.from(nav.querySelectorAll("a")).map(
      (a) => a.textContent,
    );
    expect(links).toEqual(["Research", "論文メモ"]);

    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("My Note");

    // 3 display elements -> 2 separators, none before the first element.
    expect(separators()).toHaveLength(2);
    const firstChild = nav.firstElementChild;
    expect(firstChild?.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("renders only the note title with no separators at root level", () => {
    act(() => {
      root.render(<NoteBreadcrumb segments={[]} noteTitle="Root Note" />);
    });

    expect(separators()).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    const current = container.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("Root Note");
  });

  it("links each directory segment to the directoryId-scoped home list", () => {
    act(() => {
      root.render(
        <NoteBreadcrumb
          segments={[
            { id: "d1", name: "Research" },
            { id: "d2", name: "論文メモ" },
          ]}
          noteTitle="My Note"
        />,
      );
    });

    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a"),
    );
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a.getAttribute("data-to")).toBe("/");
    }
    const searches = links.map((a) =>
      JSON.parse(a.getAttribute("data-search") ?? "null"),
    );
    expect(searches[0]).toMatchObject({ directoryId: "d1" });
    expect(searches[1]).toMatchObject({ directoryId: "d2" });
  });
});
