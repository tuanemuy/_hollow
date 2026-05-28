// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #219: the home view dispatches list/tile/calendar purely from
 * the URL `?display=` value via `getRouteApi("/").useSearch`. This test
 * pins the dispatch contract so a regression in the conditional ladder
 * (or a wrong fallback for `undefined`) gets caught immediately.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let currentDisplay: "list" | "tile" | "calendar" | undefined;

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useSearch: <T,>({
      select,
    }: {
      select: (s: { display?: "list" | "tile" | "calendar" | undefined }) => T;
    }) => select({ display: currentDisplay }),
  }),
}));

vi.mock("../ListView", () => ({
  ListView: ({ notes }: { notes: readonly { id: string }[] }) => (
    <div data-view="list" data-count={notes.length} />
  ),
}));
vi.mock("../TileView", () => ({
  TileView: ({ notes }: { notes: readonly { id: string }[] }) => (
    <div data-view="tile" data-count={notes.length} />
  ),
}));
vi.mock("../CalendarView", () => ({
  CalendarView: ({ notes }: { notes: readonly { id: string }[] }) => (
    <div data-view="calendar" data-count={notes.length} />
  ),
}));

const { NoteListViews } = await import("../NoteListViews");

const notes = [
  { id: "n1" },
  { id: "n2" },
] as unknown as readonly import("../../loaders").DisplayedNote[];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  currentDisplay = undefined;
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

function activeView(): string | null {
  const el = container.querySelector("[data-view]");
  return el?.getAttribute("data-view") ?? null;
}

describe("NoteListViews", () => {
  it("renders the ListView when display is 'list'", () => {
    currentDisplay = "list";
    act(() => {
      root.render(<NoteListViews notes={notes} />);
    });
    expect(activeView()).toBe("list");
  });

  it("renders the TileView when display is 'tile'", () => {
    currentDisplay = "tile";
    act(() => {
      root.render(<NoteListViews notes={notes} />);
    });
    expect(activeView()).toBe("tile");
  });

  it("renders the CalendarView when display is 'calendar'", () => {
    currentDisplay = "calendar";
    act(() => {
      root.render(<NoteListViews notes={notes} />);
    });
    expect(activeView()).toBe("calendar");
  });

  it("falls back to the ListView when display is undefined", () => {
    currentDisplay = undefined;
    act(() => {
      root.render(<NoteListViews notes={notes} />);
    });
    expect(activeView()).toBe("list");
  });

  it("forwards the notes array unchanged to the active view", () => {
    currentDisplay = "tile";
    act(() => {
      root.render(<NoteListViews notes={notes} />);
    });
    const el = container.querySelector('[data-view="tile"]');
    expect(el?.getAttribute("data-count")).toBe("2");
  });
});
