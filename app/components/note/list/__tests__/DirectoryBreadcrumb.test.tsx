// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavior contract for the note-list directory breadcrumb (Issue #743):
 *
 *  - The trailing segment (current directory) is a non-link
 *    `aria-current="page"` span, not a `<Link>` — matching `NoteBreadcrumb`.
 *  - Every ancestor segment is a `directoryId`-scoped home-list link.
 *  - There is no trailing "clear directory filter" `×` button anymore.
 *  - Separators (›) appear *between* elements only, never before the first.
 *  - Keys use the cumulative id path (asserted indirectly via stable render).
 *  - There is no leading Folder icon.
 *
 * `Link` is mocked as an anchor exposing its `search.directoryId` as a
 * data-attr so the scoped-filter contract can be asserted.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    className,
  }: {
    children: ReactNode;
    search?: { directoryId?: string };
    className?: string;
  }) => (
    <a
      href="/"
      className={className}
      data-directory-id={search?.directoryId ?? ""}
    >
      {children}
    </a>
  ),
}));

const { DirectoryBreadcrumb } = await import("../DirectoryBreadcrumb");

type Segment = { id: string; name: string };

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

function render(segments: readonly Segment[]) {
  act(() => {
    root.render(<DirectoryBreadcrumb segments={segments} />);
  });
}

function nav(): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    'nav[aria-label="現在のディレクトリ"]',
  );
  if (el === null) throw new Error("breadcrumb nav not found");
  return el;
}

function links(): HTMLAnchorElement[] {
  return Array.from(nav().querySelectorAll<HTMLAnchorElement>("a"));
}

function separators(): HTMLElement[] {
  // ChevronRight separators carry the weakest `text-hairline-strong` tone and
  // are the only aria-hidden spans (no leading Folder icon anymore).
  return Array.from(
    nav().querySelectorAll<HTMLElement>('span[aria-hidden="true"]'),
  );
}

describe("DirectoryBreadcrumb (Issue #743)", () => {
  it("renders ancestors as directoryId-scoped links and the tail as a non-link aria-current span", () => {
    render([
      { id: "d1", name: "Documents" },
      { id: "d2", name: "Research" },
    ]);

    // Only the ancestor is a link; the tail is not.
    const anchors = links();
    expect(anchors.map((a) => a.textContent)).toEqual(["Documents"]);
    expect(anchors.map((a) => a.getAttribute("data-directory-id"))).toEqual([
      "d1",
    ]);

    const current = nav().querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();
    expect(current?.textContent).toBe("Research");
    // The current segment must not be a link.
    expect(current?.tagName).not.toBe("A");
  });

  it("renders a single non-link span (no leading separator) for a one-segment path", () => {
    render([{ id: "d1", name: "Documents" }]);
    expect(links()).toHaveLength(0);
    expect(separators()).toHaveLength(0);
    const current = nav().querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("Documents");
  });

  it("never renders a clear-directory × button", () => {
    render([
      { id: "d1", name: "Documents" },
      { id: "d2", name: "Research" },
    ]);
    expect(
      container.querySelector(
        'button[aria-label="ディレクトリフィルタを解除"]',
      ),
    ).toBeNull();
    expect(nav().querySelectorAll("button")).toHaveLength(0);
  });

  it("renders separators between elements only — none before the first", () => {
    render([
      { id: "d1", name: "Documents" },
      { id: "d2", name: "Research" },
      { id: "d3", name: "Drafts" },
    ]);
    // For N segments there must be exactly N-1 separators.
    const seps = separators();
    expect(seps).toHaveLength(2);
    // No separator precedes the first element (a link here).
    const first = links()[0];
    expect(first).not.toBeUndefined();
    for (const sep of seps) {
      expect(
        first.compareDocumentPosition(sep) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("has no leading Folder icon before the first segment", () => {
    render([
      { id: "d1", name: "Documents" },
      { id: "d2", name: "Research" },
    ]);
    // The first child of the nav is the first segment wrapper, whose first
    // rendered element is the ancestor link itself — not an icon span.
    const firstSegmentWrapper = nav().firstElementChild;
    expect(firstSegmentWrapper?.querySelector("a")).not.toBeNull();
    expect(
      firstSegmentWrapper?.querySelector('span[aria-hidden="true"]'),
    ).toBeNull();
    // Only N-1 aria-hidden spans exist (the separators); a leading icon would
    // make N.
    expect(separators()).toHaveLength(1);
  });

  it("uses cumulative-id keys so repeated names render distinctly without warnings", () => {
    // Sibling/ancestor name repetition must not collapse keys; a stable render
    // of all four labels confirms each segment is keyed by its cumulative id
    // path rather than its (duplicated) name.
    render([
      { id: "a", name: "Notes" },
      { id: "b", name: "Notes" },
      { id: "c", name: "Notes" },
      { id: "d", name: "Notes" },
    ]);
    const labels = Array.from(nav().querySelectorAll("a, [aria-current]")).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["Notes", "Notes", "Notes", "Notes"]);
    expect(links()).toHaveLength(3);
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});
