// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteListSearch } from "../../schema";

/**
 * Issue #382: locks the icon-only treatment of the 新規作成 / アップロード CTAs.
 * Both now drop their visible label at every breakpoint and rely on the
 * parent element's `aria-label` for the accessible name.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...rest
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    const { to, params, search, hash, ...attrs } = rest as Record<
      string,
      unknown
    >;
    void to;
    void params;
    void search;
    void hash;
    return <a {...(attrs as Record<string, unknown>)}>{children}</a>;
  },
  useRouter: () => ({ navigate: vi.fn().mockResolvedValue(undefined) }),
  useLocation: <T,>({ select }: { select: (l: { hash: string }) => T }) =>
    select({ hash: "" }),
}));

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

function renderToolbar() {
  act(() => {
    root.render(
      <NoteListToolbar
        search={{} as NoteListSearch}
        savedViews={[]}
        hasAnyFilter={false}
      />,
    );
  });
}

describe("NoteListToolbar icon-only CTAs (Issue #382)", () => {
  it("renders 新規作成 as an icon-only link with an aria-label and no visible text", () => {
    renderToolbar();
    const create = container.querySelector('[aria-label="新規作成"]');
    expect(create).not.toBeNull();
    expect(create?.getAttribute("title")).toBe("新規作成");
    expect(create?.textContent).toBe("");
    expect(create?.querySelector("svg")).not.toBeNull();
  });

  it("renders アップロード as an icon-only control with an aria-label and no visible text", () => {
    renderToolbar();
    const upload = container.querySelector('[aria-label="アップロード"]');
    expect(upload).not.toBeNull();
    expect(upload?.textContent).toBe("");
    expect(upload?.querySelector("svg")).not.toBeNull();
  });
});
