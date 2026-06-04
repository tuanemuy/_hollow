// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { NoteId } from "@/core/application/dto/note";

/**
 * Issue #382: locks the icon-only treatment of the 編集 action — accessible
 * name via the parent's `aria-label`, Icon decorative, no visible text.
 *
 * Issue #459: 複製 / 履歴 / 削除 moved behind the overflow ("その他の操作")
 * menu, so they are no longer top-level buttons. This locks that the menu
 * trigger exposes them as menuitems on open (削除 flagged danger).
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...rest
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    const { to, params, search, ...attrs } = rest as Record<string, unknown>;
    void to;
    void params;
    void search;
    return <a {...(attrs as Record<string, unknown>)}>{children}</a>;
  },
  useRouter: () => ({ navigate: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([], vi.fn()),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../../list/MoveNoteDialog", () => ({
  MoveNoteDialog: () => null,
}));
vi.mock("@/components/publication/PublishSettings", () => ({
  PublishSettings: ({ open }: { open: boolean }) =>
    open ? <div data-testid="publish-settings">公開設定</div> : null,
}));
vi.mock("../UrlCopyButton", () => ({
  UrlCopyButton: () => <button type="button">URL コピー</button>,
}));

const { NoteActions } = await import("../NoteActions");

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

function renderActions() {
  act(() => {
    root.render(
      <NoteActions
        noteId={"note-1" as unknown as NoteId}
        status="active"
        publishState={{ visibility: "private", publishedAt: null, links: [] }}
        appUrl="https://example.test"
        publicShareUrl={null}
        tree={[]}
      />,
    );
  });
}

describe("NoteActions icon-only buttons (Issue #382)", () => {
  it("renders 編集 as an icon-only link with an aria-label and no visible text", () => {
    renderActions();
    const edit = container.querySelector('[aria-label="編集"]');
    expect(edit).not.toBeNull();
    expect(edit?.tagName).toBe("A");
    expect(edit?.getAttribute("title")).toBe("編集");
    expect(edit?.textContent).toBe("");
    const svg = edit?.querySelector("svg");
    expect(svg).not.toBeNull();
    // The Icon stays decorative — no second accessible name on the SVG.
    expect(svg?.getAttribute("aria-label")).toBeNull();
  });
});

describe("NoteActions 公開設定 dialog (Issue #477)", () => {
  it("renders 公開設定 as a button (not a link) that opens the dialog on click", () => {
    renderActions();
    // Anchor on the pill's stable SR affordance (`<span class="sr-only">公開状態:
    // </span>`) rather than the volatile `visibilityLabel` text, so renaming a
    // label or adding another "非公開"-bearing button cannot misidentify it.
    const pill = Array.from(container.querySelectorAll("button")).find((b) =>
      Array.from(b.querySelectorAll("span.sr-only")).some((s) =>
        s.textContent?.includes("公開状態:"),
      ),
    );
    expect(pill).not.toBeUndefined();
    expect(pill?.tagName).toBe("BUTTON");
    // Dialog is closed until the pill is clicked.
    expect(
      container.querySelector('[data-testid="publish-settings"]'),
    ).toBeNull();
    act(() => {
      pill?.click();
    });
    expect(
      container.querySelector('[data-testid="publish-settings"]'),
    ).not.toBeNull();
  });
});

describe("NoteActions overflow menu (Issue #459)", () => {
  it("renders a closed overflow menu trigger by default", () => {
    renderActions();
    const trigger = container.querySelector(
      'button[aria-label="その他の操作"]',
    );
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    // 複製 / 履歴 / 削除 are not in the DOM until the menu opens.
    expect(container.querySelector('[role="menuitem"]')).toBeNull();
  });

  it("exposes 複製 / 履歴 / 削除 as menuitems once opened", () => {
    renderActions();
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="その他の操作"]',
    );
    act(() => {
      trigger?.click();
    });
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    const items = Array.from(
      container.querySelectorAll('[role="menuitem"]'),
    ).map((el) => el.textContent);
    expect(items).toEqual(["複製", "履歴", "削除"]);
    const del = Array.from(
      container.querySelectorAll('[role="menuitem"]'),
    ).find((el) => el.textContent === "削除");
    expect(del?.getAttribute("data-danger")).toBe("true");
  });
});
