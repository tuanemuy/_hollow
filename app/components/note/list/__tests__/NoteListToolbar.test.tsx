// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteListSearch } from "../../schema";

/**
 * Issue #649 (#626 ADR-002/005): locks the confirmed toolbar shape —
 * the 新規作成 / アップロード CTAs are gone (header-only, #628), the
 * saved-view `<select>` moved to the heading trigger (`ViewSwitcher`),
 * and 選択 / ビューとして保存 are icon-only with `aria-label` + `title`.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../SelectionContext", () => ({
  useSelection: () => ({
    state: { mode: false, ids: new Set<string>() },
    dispatch: vi.fn(),
  }),
}));

vi.mock("../DisplayModeSwitch", () => ({ DisplayModeSwitch: () => null }));
vi.mock("../SaveViewDialog", () => ({ SaveViewDialog: () => null }));

const { NoteListToolbar } = await import("../NoteListToolbar");

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

function renderToolbar(hasAnyFilter = false) {
  act(() => {
    root.render(
      <NoteListToolbar
        search={{} as NoteListSearch}
        hasAnyFilter={hasAnyFilter}
      />,
    );
  });
}

describe("NoteListToolbar confirmed layout (Issue #649 / #626)", () => {
  it("renders no 新規作成 / アップロード CTAs and no saved-view select", () => {
    renderToolbar();
    expect(container.querySelector('[aria-label="新規作成"]')).toBeNull();
    expect(container.querySelector('[aria-label="アップロード"]')).toBeNull();
    expect(container.querySelector("select")).toBeNull();
  });

  it("renders 選択 as an icon-only toggle with aria-pressed / aria-label / title", () => {
    renderToolbar();
    const select = container.querySelector('[aria-label="選択モード"]');
    expect(select).not.toBeNull();
    expect(select?.getAttribute("aria-pressed")).toBe("false");
    expect(select?.getAttribute("title")).toBe("選択モード");
    expect(select?.textContent).toBe("");
    const svg = select?.querySelector("svg");
    expect(svg).not.toBeNull();
    // The Icon stays decorative — no second accessible name on the SVG.
    expect(svg?.getAttribute("aria-label")).toBeNull();
  });

  it("renders ビューとして保存 as an icon-only button with aria-label / title", () => {
    renderToolbar(true);
    const save = container.querySelector('[aria-label="ビューとして保存"]');
    expect(save).not.toBeNull();
    expect(save?.getAttribute("title")).toBe("ビューとして保存");
    expect(save?.textContent).toBe("");
    expect(save?.hasAttribute("disabled")).toBe(false);
    expect(save?.querySelector("svg")).not.toBeNull();
  });

  it("disables ビューとして保存 with an explanatory title when no condition is set", () => {
    renderToolbar(false);
    const save = container.querySelector('[aria-label="ビューとして保存"]');
    expect(save?.hasAttribute("disabled")).toBe(true);
    expect(save?.getAttribute("title")).toBe("条件が設定されていません");
  });
});
