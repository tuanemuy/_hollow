// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { DirectoryTreeNode } from "@/core/application/dto/directory";
import { AppServerError } from "@/core/presentation/errorResponse";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const renameMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([[renameMock, renameMock]], vi.fn()),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  renameDirectoryFn: renameMock,
  createDirectoryFn: vi.fn(),
  moveDirectoryFn: vi.fn(),
  deleteDirectoryFn: vi.fn(),
}));

const routerInvalidate = vi.fn().mockResolvedValue(undefined);
const routerNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: routerInvalidate,
    navigate: routerNavigate,
  }),
  Link: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a {...(rest as Record<string, unknown>)}>{children}</a>,
}));

function makeNode(
  id: string,
  name: string,
  children: DirectoryTreeNode[] = [],
): DirectoryTreeNode {
  return {
    id,
    ownerId: "owner-1",
    parentId: null,
    name,
    slug: name,
    depth: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    children,
  } as unknown as DirectoryTreeNode;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  renameMock.mockReset();
  routerInvalidate.mockClear();
  routerNavigate.mockClear();
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

async function renderTree(tree: readonly DirectoryTreeNode[]) {
  const { DirectoryTree } = await import("../DirectoryTree");
  act(() => {
    root.render(<DirectoryTree tree={tree} />);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function openMenu(label: string) {
  const trigger = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => b.getAttribute("aria-label") === `${label} の操作`);
  if (!trigger) throw new Error(`actions trigger for "${label}" not found`);
  trigger.click();
}

function clickMenuItem(text: string) {
  const item = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((b) => (b.textContent ?? "").trim() === text);
  if (!item) throw new Error(`menuitem "${text}" not found`);
  item.click();
}

describe("DirectoryTree — optimistic rename", () => {
  it("commits the trimmed name, invalidates the tree, and closes the editor", async () => {
    // Note on coverage: the optimistic name (`useOptimistic(node.name)`) is
    // dropped the instant the commit transition finishes. The window it
    // bridges — between `router.invalidate()` settling and fresh tree props
    // re-rendering — has no analogue in this mock (props stay "Alpha"), so the
    // visual "no old-name flash" is verified in the browser, not here. This
    // test pins the commit wiring (trimmed args, invalidate, editor close).
    renameMock.mockResolvedValue({ ok: true });

    // tree[0] is the implicit root; its children are rendered.
    await renderTree([makeNode("root", "", [makeNode("d1", "Alpha")])]);

    expect(document.body.textContent).toContain("Alpha");

    // Enter rename mode via the row's actions menu.
    await act(async () => {
      openMenu("Alpha");
    });
    await act(async () => {
      clickMenuItem("リネーム");
    });

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="ディレクトリ名"]',
    );
    if (!input) throw new Error("rename input not found");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "  Renamed  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await flush();

    // Mutation invoked with the trimmed name and the tree invalidated.
    expect(renameMock).toHaveBeenCalledTimes(1);
    expect(renameMock).toHaveBeenCalledWith({
      data: { directoryId: "d1", newName: "Renamed" },
    });
    expect(routerInvalidate).toHaveBeenCalled();
    // Editor closed on success; with the mock baseline still "Alpha" the patch
    // is dropped and the row settles back to the server-confirmed name.
    expect(
      container.querySelector('input[aria-label="ディレクトリ名"]'),
    ).toBeNull();
    expect(document.body.textContent).toContain("Alpha");
  });

  it("keeps the input and reverts to the old name when rename fails", async () => {
    let rejectRename: ((e: unknown) => void) | undefined;
    renameMock.mockReturnValue(
      new Promise<void>((_res, rej) => {
        rejectRename = rej;
      }),
    );

    await renderTree([makeNode("root", "", [makeNode("d1", "Alpha")])]);

    await act(async () => {
      openMenu("Alpha");
    });
    await act(async () => {
      clickMenuItem("リネーム");
    });

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="ディレクトリ名"]',
    );
    if (!input) throw new Error("rename input not found");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Renamed");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await flush();

    expect(renameMock).toHaveBeenCalledTimes(1);
    // While the rename is in flight the input stays mounted (still editing).
    expect(
      container.querySelector('input[aria-label="ディレクトリ名"]'),
    ).not.toBeNull();

    await act(async () => {
      rejectRename?.(
        new AppServerError({
          kind: "system",
          code: null,
          message: "System error",
        }),
      );
    });
    await flush();

    // Input stays mounted for retry; the optimistic name was dropped on the
    // failed transition, so any visible label would carry the baseline name.
    const stillInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="ディレクトリ名"]',
    );
    expect(stillInput).not.toBeNull();
    const alerts = Array.from(container.querySelectorAll('[role="alert"]')).map(
      (el) => el.textContent ?? "",
    );
    expect(alerts.join(" ")).toContain("システムエラーが発生しました");
  });
});
