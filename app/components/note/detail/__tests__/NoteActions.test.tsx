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
 * Issue #382: locks the icon-only treatment of the 編集 / 複製 actions.
 * Both expose their accessible name via the parent element's `aria-label`
 * (Icon stays decorative / `aria-hidden`), and carry no visible label text.
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
        visibility="private"
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
    expect(edit?.querySelector("svg")).not.toBeNull();
  });

  it("renders 複製 as an icon-only button with an aria-label and no visible text", () => {
    renderActions();
    const dup = container.querySelector('button[aria-label="複製"]');
    expect(dup).not.toBeNull();
    expect(dup?.getAttribute("title")).toBe("複製");
    expect(dup?.textContent).toBe("");
    expect(dup?.querySelector("svg")).not.toBeNull();
  });
});
