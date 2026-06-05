// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DisplayedNote } from "../../loaders";

/**
 * Issue #499: ListView / CalendarView rows must be clickable across the
 * whole row (not just the title). This pins the row-wrapper contract:
 * unselected → a single `<a>` to the note detail with `aria-label=title`;
 * selection mode → a `<button>` that dispatches a toggle, with the
 * checkbox kept outside the wrapper so a checkbox click never double-fires.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Reuse the NoteListToolbar.test.tsx Link-mock pattern: expand <Link> to an
// <a>, stripping the router-only props so `to`/`params` don't leak as DOM
// attributes.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...rest
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    const { to, params, search, hash, ...attrs } = rest as Record<
      string,
      unknown
    >;
    const href =
      typeof to === "string" && params && typeof params === "object"
        ? Object.entries(params as Record<string, unknown>).reduce<string>(
            (acc, [key, value]) => acc.replace(`$${key}`, String(value)),
            to,
          )
        : (to as string | undefined);
    void search;
    void hash;
    return (
      <a href={href} {...(attrs as Record<string, unknown>)}>
        {children}
      </a>
    );
  },
}));

let mockMode = false;
const mockIds = new Set<string>();
const dispatchSpy = vi.fn();

vi.mock("../SelectionContext", () => ({
  useSelection: () => ({
    state: { mode: mockMode, ids: mockIds },
    dispatch: dispatchSpy,
  }),
}));

const { ListView } = await import("../ListView");
const { CalendarView } = await import("../CalendarView");

const note = {
  id: "n1",
  title: "テストノート",
  excerpt: "これは抜粋です",
  tagNames: ["tag-a"],
  visibility: "private",
  updatedAt: "2026-06-06T00:00:00.000Z",
} as unknown as DisplayedNote;

const notes = [note] as unknown as readonly DisplayedNote[];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockMode = false;
  mockIds.clear();
  dispatchSpy.mockReset();
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

describe("ListView row click area (Issue #499)", () => {
  it("renders the row as a single anchor to the note detail with aria-label=title when not selecting", () => {
    act(() => {
      root.render(<ListView notes={notes} />);
    });
    const anchors = container.querySelectorAll("li a");
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0] as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("/notes/n1");
    expect(anchor.getAttribute("aria-label")).toBe("テストノート");
    // The whole row body is inside the anchor.
    expect(anchor.textContent).toContain("これは抜粋です");
    expect(anchor.textContent).toContain("テストノート");
    // No selection button while not in selection mode.
    expect(container.querySelector("li button")).toBeNull();
  });

  it("renders the row as a button that dispatches a toggle in selection mode", () => {
    mockMode = true;
    act(() => {
      root.render(<ListView notes={notes} />);
    });
    // No detail anchor while selecting.
    expect(container.querySelector("li a")).toBeNull();
    const rowButton = container.querySelector(
      "li > button",
    ) as HTMLButtonElement | null;
    expect(rowButton).not.toBeNull();
    act(() => {
      rowButton?.click();
    });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({ type: "toggle", id: "n1" });
  });

  it("does not double-fire the row toggle when the checkbox itself is clicked", () => {
    mockMode = true;
    act(() => {
      root.render(<ListView notes={notes} />);
    });
    const checkbox = container.querySelector(
      '[role="checkbox"]',
    ) as HTMLButtonElement | null;
    expect(checkbox).not.toBeNull();
    act(() => {
      checkbox?.click();
    });
    // Checkbox click toggles once; stopPropagation prevents the row button
    // from also firing.
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({ type: "toggle", id: "n1" });
  });
});

describe("CalendarView row click area (Issue #499)", () => {
  it("renders the title as an anchor to the note detail when not selecting", () => {
    act(() => {
      root.render(<CalendarView notes={notes} />);
    });
    const anchors = container.querySelectorAll("li a");
    expect(anchors).toHaveLength(1);
    const anchor = anchors[0] as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("/notes/n1");
    expect(anchor.textContent).toBe("テストノート");
    expect(container.querySelector("li button")).toBeNull();
  });

  it("renders the title as a button that dispatches a toggle in selection mode", () => {
    mockMode = true;
    act(() => {
      root.render(<CalendarView notes={notes} />);
    });
    expect(container.querySelector("li a")).toBeNull();
    const rowButton = container.querySelector(
      "li > button",
    ) as HTMLButtonElement | null;
    expect(rowButton).not.toBeNull();
    expect(rowButton?.textContent).toBe("テストノート");
    act(() => {
      rowButton?.click();
    });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({ type: "toggle", id: "n1" });
  });
});
