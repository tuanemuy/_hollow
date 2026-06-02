// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { SavedViewDTO } from "@/core/application/dto/view";
import { AppServerError } from "@/core/presentation/errorResponse";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const deleteMock = vi.fn();
const setDefaultMock = vi.fn();
const renameMock = vi.fn();
const updateMock = vi.fn();
const duplicateMock = vi.fn();
const repairMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [deleteMock, deleteMock],
      [setDefaultMock, setDefaultMock],
      [renameMock, renameMock],
      [updateMock, updateMock],
      [duplicateMock, duplicateMock],
      [repairMock, repairMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../action", () => ({
  deleteSavedViewFn: deleteMock,
  setDefaultSavedViewFn: setDefaultMock,
  renameSavedViewFn: renameMock,
  updateSavedViewFn: updateMock,
  duplicateSavedViewFn: duplicateMock,
  repairSavedViewFn: repairMock,
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

function makeView(over: {
  id: string;
  name?: string;
  kind?: "personal" | "public";
  isDefault?: boolean;
  brokenConditions?: SavedViewDTO["brokenConditions"];
}): SavedViewDTO {
  return {
    id: over.id,
    ownerId: "owner-1",
    name: over.name ?? `View ${over.id}`,
    kind: over.kind ?? "personal",
    query: {
      directoryId: null,
      tagIds: [],
      dateRange: null,
      keyword: null,
      referencingNoteId: null,
      visibilityFilter: [],
    },
    displayMode: "list",
    calendarDateKey: "updated",
    sort: { by: "updatedAt", direction: "desc" },
    isDefault: over.isDefault ?? false,
    brokenConditions: over.brokenConditions ?? [],
  } as unknown as SavedViewDTO;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  deleteMock.mockReset();
  setDefaultMock.mockReset();
  renameMock.mockReset();
  updateMock.mockReset();
  duplicateMock.mockReset();
  repairMock.mockReset();
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

async function renderList(views: readonly SavedViewDTO[]) {
  const { SavedViewsList } = await import("../index");
  act(() => {
    root.render(<SavedViewsList views={views} directories={[]} tags={[]} />);
  });
}

function buttonByLabel(label: string): HTMLButtonElement {
  const btns = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("button"),
  );
  const found = btns.find((b) => b.getAttribute("aria-label") === label);
  if (!found) throw new Error(`button[aria-label="${label}"] not found`);
  return found;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SavedViewsList — optimistic delete", () => {
  it("removes the row immediately on confirm while the mutation is pending", async () => {
    // Keep the delete pending so the optimistic projection is observable.
    let resolveDelete: (() => void) | undefined;
    deleteMock.mockReturnValue(
      new Promise<void>((res) => {
        resolveDelete = res;
      }),
    );

    await renderList([
      makeView({ id: "v1", name: "Alpha" }),
      makeView({ id: "v2", name: "Beta" }),
    ]);

    expect(document.body.textContent).toContain("Alpha");

    await act(async () => {
      buttonByLabel("Alpha を削除").click();
    });
    const dialog = document.body.querySelector<HTMLElement>(
      '[role="alertdialog"]',
    );
    const confirmBtn = dialog?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    await act(async () => {
      confirmBtn?.click();
    });
    await flush();

    expect(deleteMock).toHaveBeenCalledTimes(1);
    // Row gone optimistically even though the delete promise is unresolved.
    expect(document.body.textContent).not.toContain("Alpha");
    expect(document.body.textContent).toContain("Beta");

    await act(async () => {
      resolveDelete?.();
    });
    await flush();
  });

  it("restores the row and shows an alert when delete fails", async () => {
    // Hold the rejection so the removed -> restored transition is observable
    // (not just the final restored state).
    let rejectDelete: ((e: unknown) => void) | undefined;
    deleteMock.mockReturnValue(
      new Promise<void>((_res, rej) => {
        rejectDelete = rej;
      }),
    );

    await renderList([makeView({ id: "v1", name: "Alpha" })]);

    await act(async () => {
      buttonByLabel("Alpha を削除").click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      confirmBtn?.click();
    });
    await flush();

    expect(deleteMock).toHaveBeenCalledTimes(1);
    // Optimistically removed while the delete is in flight.
    expect(document.body.textContent).not.toContain("Alpha");

    await act(async () => {
      rejectDelete?.(
        new AppServerError({
          kind: "system",
          code: null,
          message: "System error",
        }),
      );
    });
    await flush();

    // Snap back: the row is visible again with the error in its slot.
    expect(document.body.textContent).toContain("Alpha");
    const alerts = Array.from(container.querySelectorAll('[role="alert"]')).map(
      (el) => el.textContent ?? "",
    );
    expect(alerts.join(" ")).toContain("システムエラーが発生しました");
  });
});

describe("SavedViewsList — optimistic rename", () => {
  it("reflects the new name immediately and reverts on failure", async () => {
    let rejectRename: ((e: unknown) => void) | undefined;
    renameMock.mockReturnValue(
      new Promise((_res, rej) => {
        rejectRename = rej;
      }),
    );

    await renderList([makeView({ id: "v1", name: "Alpha" })]);

    await act(async () => {
      buttonByLabel("Alpha の名前を変更").click();
    });
    const input =
      container.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input) throw new Error("rename input not found");
    await act(async () => {
      // React 19 controlled inputs intercept the prototype `value` setter;
      // go through the native setter so onChange fires.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Renamed");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const saveBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "保存");
    await act(async () => {
      saveBtn?.click();
    });
    await flush();

    // Optimistic name shown while the rename is in flight.
    expect(document.body.textContent).toContain("Renamed");

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

    // Snap back to the server-confirmed name.
    expect(document.body.textContent).toContain("Alpha");
    expect(document.body.textContent).not.toContain("Renamed");
  });
});

describe("SavedViewsList — optimistic duplicate", () => {
  it("adds the duplicated row immediately on resolve", async () => {
    duplicateMock.mockResolvedValue({
      view: makeView({ id: "v2", name: "Alpha のコピー" }),
    });
    // Hold the loader invalidate pending so the optimistic add (applied after
    // the duplicate resolves) stays visible — `useOptimistic` drops the patch
    // once the transition completes.
    let resolveInvalidate: (() => void) | undefined;
    routerInvalidate.mockReturnValueOnce(
      new Promise<void>((res) => {
        resolveInvalidate = res;
      }),
    );

    await renderList([makeView({ id: "v1", name: "Alpha" })]);

    expect(document.body.textContent).not.toContain("Alpha のコピー");

    await act(async () => {
      buttonByLabel("Alpha を複製").click();
    });
    await flush();

    expect(duplicateMock).toHaveBeenCalledTimes(1);
    // Duplicate resolved, optimistic add applied, invalidate still pending:
    // the new row is present.
    expect(document.body.textContent).toContain("Alpha のコピー");

    await act(async () => {
      resolveInvalidate?.();
    });
    await flush();
  });

  it("does not double-add when the new id already exists in the baseline", async () => {
    // Baseline already carries v2; the optimistic add must dedupe by id.
    duplicateMock.mockResolvedValue({
      view: makeView({ id: "v2", name: "Beta" }),
    });

    await renderList([
      makeView({ id: "v1", name: "Alpha" }),
      makeView({ id: "v2", name: "Beta" }),
    ]);

    await act(async () => {
      buttonByLabel("Alpha を複製").click();
    });
    await flush();

    const betas = (document.body.textContent ?? "").match(/Beta/g) ?? [];
    expect(betas.length).toBe(1);
  });

  it("shows an alert on the source row when duplicate fails", async () => {
    let rejectDuplicate: ((e: unknown) => void) | undefined;
    duplicateMock.mockReturnValue(
      new Promise((_res, rej) => {
        rejectDuplicate = rej;
      }),
    );

    await renderList([makeView({ id: "v1", name: "Alpha" })]);

    await act(async () => {
      buttonByLabel("Alpha を複製").click();
    });
    await flush();

    await act(async () => {
      rejectDuplicate?.(
        new AppServerError({
          kind: "system",
          code: null,
          message: "System error",
        }),
      );
    });
    await flush();

    // Source row still present; error surfaced in its slot.
    expect(document.body.textContent).toContain("Alpha");
    const alerts = Array.from(container.querySelectorAll('[role="alert"]')).map(
      (el) => el.textContent ?? "",
    );
    expect(alerts.join(" ")).toContain("システムエラーが発生しました");
  });
});

describe("SavedViewsList — optimistic default toggle", () => {
  it("reflects only the toggled row; other rows keep baseline until invalidate", async () => {
    let resolveDefault: (() => void) | undefined;
    setDefaultMock.mockReturnValue(
      new Promise<void>((res) => {
        resolveDefault = res;
      }),
    );

    await renderList([
      makeView({ id: "v1", name: "Alpha", isDefault: true }),
      makeView({ id: "v2", name: "Beta", isDefault: false }),
    ]);

    await act(async () => {
      buttonByLabel("Beta を既定にする").click();
    });
    await flush();

    // Beta's own button now reads "既定を解除" (optimistic self-reflection).
    const labels = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).map((b) => b.getAttribute("aria-label"));
    expect(labels).toContain("Beta の既定を解除");
    // Alpha's default is NOT optimistically cleared — it converges on
    // invalidate (ADR-003 tradeoff: a brief "two defaults" window).
    expect(labels).toContain("Alpha の既定を解除");

    await act(async () => {
      resolveDefault?.();
    });
    await flush();
  });
});
