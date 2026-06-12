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
 *    `aria-label`「ビューを切り替え: 現在 {ビュー名}」(non-search) or the bare
 *    「ビューを切り替え」(search), `title` always present.
 * 2. listbox contract — `role="listbox"` panel, `role="option"` items with
 *    `aria-selected`.
 * 3. navigation contract (moved verbatim from the old toolbar `<select>`):
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
      "ビューを切り替え: 現在 すべてのノート",
    );
    expect(btn.getAttribute("title")).toBe("ビューを切り替え");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the applied saved view's name", () => {
    render({ viewId: "v2" });
    const btn = trigger();
    expect(btn.textContent).toBe("未公開の下書き");
    expect(btn.getAttribute("aria-label")).toBe(
      "ビューを切り替え: 現在 未公開の下書き",
    );
  });

  it("prefers the search phrasing while searching and drops 「現在 …」 from the aria-label (ADR-005)", () => {
    render({ q: "memo", viewId: "v1" });
    const btn = trigger();
    expect(btn.textContent).toBe("「memo」の検索結果");
    expect(btn.getAttribute("aria-label")).toBe("ビューを切り替え");
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
