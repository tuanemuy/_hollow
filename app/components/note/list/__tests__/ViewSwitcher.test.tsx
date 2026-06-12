// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { NoteListSearch } from "../../schema";

/**
 * Issue #649 (#626 ADR-004 / `.issue/649/adr.md` ADR-005): the page heading
 * is the saved-view switching trigger. Locks:
 *
 * 1. trigger aria contract — `aria-haspopup="listbox"` / `aria-expanded`,
 *    `aria-label`「{可視見出し} — ビューを切り替え」(label-in-name, WCAG
 *    2.5.3 — the visible heading text leads in both the search and
 *    non-search states), `title` always present.
 * 2. listbox contract — `role="listbox"` panel, `role="option"` items with
 *    `aria-selected`; an unknown viewId falls back to すべてのノート for
 *    heading, aria-selected and initial focus alike.
 * 3. keyboard contract — roving tabindex starts on the selected option,
 *    arrow keys move it, Escape closes and restores trigger focus, and
 *    selection restores focus BEFORE navigating.
 * 4. navigation contract:
 *    viewId selection → `{ viewId }` only (`display` dropped for the #219
 *    redirect normalisation); すべてのノート → only `display` survives.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: navigateMock }),
}));

const { ViewSwitcher } = await import("../ViewSwitcher");

const savedViews = [
  { id: "v1", name: "今週のレビュー" },
  { id: "v2", name: "未公開の下書き" },
] as unknown as readonly SavedViewDTO[];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  navigateMock.mockClear();
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

function render(search: Partial<NoteListSearch>) {
  act(() => {
    root.render(
      <ViewSwitcher
        search={search as NoteListSearch}
        savedViews={savedViews}
      />,
    );
  });
}

function trigger(): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>(
    'h1 button[aria-haspopup="listbox"]',
  );
  if (btn === null) throw new Error("trigger not found");
  return btn;
}

function openListbox(): void {
  act(() => {
    trigger().click();
  });
}

describe("ViewSwitcher trigger aria contract", () => {
  it("shows the default view name in the heading and the aria-label", () => {
    render({});
    const btn = trigger();
    expect(btn.textContent).toBe("すべてのノート");
    expect(btn.getAttribute("aria-label")).toBe(
      "すべてのノート — ビューを切り替え",
    );
    expect(btn.getAttribute("title")).toBe("ビューを切り替え");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the applied saved view's name", () => {
    render({ viewId: "v2" });
    const btn = trigger();
    expect(btn.textContent).toBe("未公開の下書き");
    expect(btn.getAttribute("aria-label")).toBe(
      "未公開の下書き — ビューを切り替え",
    );
  });

  it("keeps the visible search phrasing inside the aria-label while searching (ADR-005, WCAG 2.5.3)", () => {
    render({ q: "memo", viewId: "v1" });
    const btn = trigger();
    expect(btn.textContent).toBe("「memo」の検索結果");
    expect(btn.getAttribute("aria-label")).toBe(
      "「memo」の検索結果 — ビューを切り替え",
    );
  });
});

describe("ViewSwitcher listbox", () => {
  it("opens a role=listbox panel with aria-selected options", () => {
    render({ viewId: "v1" });
    openListbox();

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const panel = container.querySelector('[role="listbox"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-label")).toBe("ビューを切り替え");

    const options = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    expect(options.map((o) => o.textContent)).toEqual([
      "すべてのノート",
      "今週のレビュー",
      "未公開の下書き",
    ]);
    expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("falls back to すべてのノート (heading + aria-selected + initial focus) for an unknown viewId", () => {
    render({ viewId: "gone" });
    expect(trigger().textContent).toBe("すべてのノート");
    openListbox();

    const options = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(options[0]?.getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(options[0]);
  });

  it("navigates with `{ viewId }` only when a saved view is picked (#219 redirect normalisation)", () => {
    render({});
    openListbox();

    act(() => {
      const option = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
      ).find((o) => o.textContent === "今週のレビュー");
      option?.click();
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.to).toBe("/");
    // `display` must be dropped so the server fn's redirect can normalise it.
    expect(call.search({ display: "tile", q: "x" })).toEqual({
      viewId: "v1",
    });
  });

  it("keeps only `display` when すべてのノート is picked (#215 clean URL)", () => {
    render({ viewId: "v1" });
    openListbox();

    act(() => {
      const option = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
      ).find((o) => o.textContent === "すべてのノート");
      option?.click();
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    const call = navigateMock.mock.calls[0]?.[0] as {
      to: string;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.to).toBe("/");
    expect(call.search({ viewId: "v1", display: "calendar", page: 3 })).toEqual(
      { display: "calendar" },
    );
  });
});

describe("ViewSwitcher keyboard contract", () => {
  function options(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
  }

  function keydownOnListbox(key: string) {
    const listbox = container.querySelector('[role="listbox"]') as HTMLElement;
    act(() => {
      listbox.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    });
  }

  it("lands roving focus on the selected option when opened (initialIndex)", () => {
    render({ viewId: "v2" });
    openListbox();
    const items = options();
    expect(items.map((o) => o.getAttribute("tabindex"))).toEqual([
      "-1",
      "-1",
      "0",
    ]);
    expect(document.activeElement).toBe(items[2]);
  });

  it("moves roving focus with ArrowDown / ArrowUp / Home / End", () => {
    render({});
    openListbox();
    expect(options()[0]?.getAttribute("tabindex")).toBe("0");
    keydownOnListbox("ArrowDown");
    expect(options()[1]?.getAttribute("tabindex")).toBe("0");
    expect(options()[0]?.getAttribute("tabindex")).toBe("-1");
    keydownOnListbox("End");
    expect(options()[2]?.getAttribute("tabindex")).toBe("0");
    keydownOnListbox("ArrowUp");
    expect(options()[1]?.getAttribute("tabindex")).toBe("0");
    keydownOnListbox("Home");
    expect(options()[0]?.getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(options()[0]);
  });

  it("closes on Escape and restores focus to the trigger", () => {
    render({});
    openListbox();
    expect(options()).toHaveLength(3);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
  });

  it("restores focus to the trigger BEFORE navigating on selection", () => {
    let activeAtNavigate: Element | null = null;
    navigateMock.mockImplementationOnce(async () => {
      activeAtNavigate = document.activeElement;
    });
    render({});
    openListbox();
    act(() => {
      options()
        .find((o) => o.textContent === "今週のレビュー")
        ?.click();
    });
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(activeAtNavigate).toBe(trigger());
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});
