// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import { AppServerError } from "@/core/presentation/errorResponse";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const renameMock = vi.fn();
const deleteMock = vi.fn();
const createMock = vi.fn();
const mergeMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [renameMock, renameMock],
      [deleteMock, deleteMock],
      [createMock, createMock],
      [mergeMock, mergeMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  renameTagFn: renameMock,
  deleteTagFn: deleteMock,
  createTagFn: createMock,
  mergeTagsFn: mergeMock,
}));

const routerInvalidate = vi.fn().mockResolvedValue(undefined);
const routerNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: routerInvalidate,
    navigate: routerNavigate,
  }),
}));

type Tag = {
  id: string;
  name: string;
  noteCount: number;
  lastUsedAt: string | null;
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  renameMock.mockReset();
  deleteMock.mockReset();
  createMock.mockReset();
  mergeMock.mockReset();
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

async function renderList(tags: readonly Tag[]) {
  const { TagList } = await import("../TagList");
  act(() => {
    root.render(
      <TagList tags={tags} query={undefined} sort="name" order="asc" />,
    );
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const btns = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("button"),
  );
  const found = btns.find((b) => (b.textContent ?? "").trim().includes(text));
  if (!found) throw new Error(`button containing "${text}" not found`);
  return found;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function makeTag(id: string, name: string, noteCount = 0): Tag {
  return { id, name, noteCount, lastUsedAt: null };
}

function makeTagWithLastUsed(
  id: string,
  name: string,
  noteCount: number,
  lastUsedAt: string,
): Tag {
  return { id, name, noteCount, lastUsedAt };
}

describe("reduceTags", () => {
  it("removes a tag by id", async () => {
    const { reduceTags } = await import("../TagList");
    const tags = [
      makeTag("t1", "alpha", 5),
      makeTag("t2", "beta", 3),
      makeTag("t3", "gamma", 1),
    ];

    const result = reduceTags(tags, { type: "remove", id: "t2" });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("t1");
    expect(result[0].name).toBe("alpha");
    expect(result[1].id).toBe("t3");
    expect(result[1].name).toBe("gamma");
  });

  it("preserves order and other fields when removing a tag", async () => {
    const { reduceTags } = await import("../TagList");
    const tags = [
      makeTag("t1", "first", 10),
      makeTag("t2", "second", 20),
      makeTag("t3", "third", 30),
    ];

    const result = reduceTags(tags, { type: "remove", id: "t1" });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("t2");
    expect(result[0].noteCount).toBe(20);
    expect(result[1].id).toBe("t3");
    expect(result[1].noteCount).toBe(30);
  });

  it("renames a tag by id while preserving other fields", async () => {
    const { reduceTags } = await import("../TagList");
    const tags = [makeTag("t1", "alpha", 5), makeTag("t2", "beta", 3)];

    const result = reduceTags(tags, {
      type: "rename",
      id: "t1",
      name: "alpha-renamed",
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("t1");
    expect(result[0].name).toBe("alpha-renamed");
    expect(result[0].noteCount).toBe(5);
    expect(result[1].name).toBe("beta");
  });

  it("preserves noteCount during rename so merge candidates stay accurate", async () => {
    const { reduceTags } = await import("../TagList");
    const tags = [makeTag("t1", "original", 42)];

    const result = reduceTags(tags, {
      type: "rename",
      id: "t1",
      name: "renamed",
    });

    expect(result[0].noteCount).toBe(42);
  });
});

describe("TagList — optimistic rename", () => {
  it("reflects the new name immediately and reverts on failure", async () => {
    let rejectRename: ((e: unknown) => void) | undefined;
    renameMock.mockReturnValue(
      new Promise((_res, rej) => {
        rejectRename = rej;
      }),
    );

    await renderList([
      { id: "t1", name: "alpha", noteCount: 3, lastUsedAt: null },
    ]);

    expect(document.body.textContent).toContain("#alpha");

    await act(async () => {
      buttonByText("リネーム").click();
    });
    // The create-tag form also has a text input; pick the inline rename one
    // by its current value (the tag's name).
    const input = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="text"]'),
    ).find((el) => el.value === "alpha");
    if (!input) throw new Error("rename input not found");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "beta");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      buttonByText("保存").click();
    });
    await flush();

    // Optimistic name shown while the rename is in flight; editor closed.
    expect(document.body.textContent).toContain("#beta");
    expect(renameMock).toHaveBeenCalledTimes(1);

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

    // Snap back to the server-confirmed name + alert.
    expect(document.body.textContent).toContain("#alpha");
    expect(document.body.textContent).not.toContain("#beta");
    const alerts = Array.from(container.querySelectorAll('[role="alert"]')).map(
      (el) => el.textContent ?? "",
    );
    expect(alerts.join(" ")).toContain("システムエラーが発生しました");
  });
});

describe("TagList — optimistic delete", () => {
  it("removes the row immediately on confirm while the delete is pending", async () => {
    let resolveDelete: (() => void) | undefined;
    deleteMock.mockReturnValue(
      new Promise<void>((res) => {
        resolveDelete = res;
      }),
    );

    await renderList([
      { id: "t1", name: "alpha", noteCount: 0, lastUsedAt: null },
      { id: "t2", name: "beta", noteCount: 0, lastUsedAt: null },
    ]);

    expect(document.body.textContent).toContain("2 件のタグ");

    // Open the delete confirm for the first row.
    const deleteBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim().includes("削除"));
    await act(async () => {
      deleteBtn?.click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      confirmBtn?.click();
    });
    await flush();

    expect(deleteMock).toHaveBeenCalledTimes(1);
    // Row gone optimistically (count too), even though delete is unresolved.
    expect(document.body.textContent).not.toContain("#alpha");
    expect(document.body.textContent).toContain("#beta");
    expect(document.body.textContent).toContain("1 件のタグ");

    await act(async () => {
      resolveDelete?.();
    });
    await flush();
  });

  it("drops a deleted tag from the merge candidates immediately", async () => {
    let resolveDelete: (() => void) | undefined;
    deleteMock.mockReturnValue(
      new Promise<void>((res) => {
        resolveDelete = res;
      }),
    );

    // With three tags, each has two merge candidates. After deleting alpha,
    // the remaining two tags (beta, gamma) should only see each other as candidates.
    // This ensures the deleted tag is properly removed from all candidate lists.
    await renderList([
      { id: "t1", name: "alpha", noteCount: 0, lastUsedAt: null },
      { id: "t2", name: "beta", noteCount: 0, lastUsedAt: null },
      { id: "t3", name: "gamma", noteCount: 0, lastUsedAt: null },
    ]);

    const mergeButtons = () =>
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>("button"),
      ).filter((b) => (b.textContent ?? "").trim().includes("統合"));

    // Before delete: 3 tags, each with 2 candidates → 3 merge buttons
    expect(mergeButtons().length).toBe(3);

    // Find and click the first delete button (alpha's delete)
    const deleteButtons = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) => (b.textContent ?? "").trim().includes("削除"));
    await act(async () => {
      deleteButtons[0]?.click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      confirmBtn?.click();
    });
    await flush();

    // alpha removed → beta and gamma remain, each now has only 1 candidate
    // (each other), so we should have 2 merge buttons instead of 3.
    expect(document.body.textContent).not.toContain("#alpha");
    expect(document.body.textContent).toContain("#beta");
    expect(document.body.textContent).toContain("#gamma");
    expect(mergeButtons().length).toBe(2);

    await act(async () => {
      resolveDelete?.();
    });
    await flush();
  });

  it("restores the row and shows an alert when delete fails", async () => {
    let rejectDelete: ((e: unknown) => void) | undefined;
    deleteMock.mockReturnValue(
      new Promise<void>((_res, rej) => {
        rejectDelete = rej;
      }),
    );

    await renderList([
      { id: "t1", name: "alpha", noteCount: 0, lastUsedAt: null },
    ]);

    const deleteBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim().includes("削除"));
    await act(async () => {
      deleteBtn?.click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      confirmBtn?.click();
    });
    await flush();

    expect(document.body.textContent).not.toContain("#alpha");

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

    expect(document.body.textContent).toContain("#alpha");
    const alerts = Array.from(container.querySelectorAll('[role="alert"]')).map(
      (el) => el.textContent ?? "",
    );
    expect(alerts.join(" ")).toContain("システムエラーが発生しました");
  });
});

describe("TagList — lastUsedAt display (T-W-003)", () => {
  it("displays 'unused' for tags with lastUsedAt: null", async () => {
    await renderList([makeTag("t1", "alpha", 5), makeTag("t2", "beta", 3)]);

    const content = document.body.textContent ?? "";
    // Both tags should show "未使用" (unused)
    const unusedMatches = (content.match(/未使用/g) ?? []).length;
    expect(unusedMatches).toBe(2);
    expect(content).toContain("未使用");
  });

  it("displays 'lastUsedAt YYYY/MM/DD' for tags with ISO date string", async () => {
    // Use 2026-06-01T12:00:00.000Z (UTC noon so the date doesn't shift across
    // timezones) → should render as "2026/06/01" via toLocaleDateString.
    // We assert loosely for year/month/day parts to be timezone-resilient.
    const lastUsedIso = "2026-06-01T12:00:00.000Z";
    await renderList([makeTagWithLastUsed("t1", "research", 10, lastUsedIso)]);

    const content = document.body.textContent ?? "";
    // The formatLastUsed function outputs "最終使用 YYYY/MM/DD"
    // We check for the label and the year/month/day parts separately to avoid
    // timezone-related failures.
    expect(content).toContain("最終使用");
    // The date should include 2026, 06, and 01
    expect(content).toMatch(/2026/);
    expect(content).toMatch(/06/);
    expect(content).toMatch(/01/);
  });

  it("displays 'lastUsedAt' with multiple tags of mixed lastUsedAt states", async () => {
    const iso1 = "2026-05-15T12:00:00.000Z";
    const iso2 = "2026-06-08T12:00:00.000Z";
    await renderList([
      makeTagWithLastUsed("t1", "alpha", 5, iso1),
      makeTag("t2", "beta", 3),
      makeTagWithLastUsed("t3", "gamma", 7, iso2),
    ]);

    // Query the ul element specifically to avoid the toolbar
    const ul = container.querySelector("ul");
    expect(ul).not.toBeNull();
    const rows = Array.from(ul?.querySelectorAll("li") ?? []);
    expect(rows.length).toBe(3);
    // Row 0 (alpha): has lastUsedAt → should show date
    expect(rows[0]?.textContent).toContain("2026");
    expect(rows[0]?.textContent).toContain("05");
    // Row 1 (beta): has null → should show "未使用"
    expect(rows[1]?.textContent).toContain("未使用");
    // Row 2 (gamma): has lastUsedAt → should show date
    expect(rows[2]?.textContent).toContain("2026");
    expect(rows[2]?.textContent).toContain("06");
  });

  it("falls back to 'unused' for invalid/unparseable dates", async () => {
    const invalidIso = "invalid-date-string";
    await renderList([makeTagWithLastUsed("t1", "test", 1, invalidIso)]);

    // Query the ul element specifically to avoid the toolbar
    const ul = container.querySelector("ul");
    expect(ul).not.toBeNull();
    const tagContent = ul?.textContent ?? "";
    expect(tagContent).toContain("未使用");
    // The tag row should NOT show a date (formatLastUsed returns "未使用" for invalid dates)
    expect(tagContent).not.toMatch(/\d{4}\/\d{2}\/\d{2}/);
  });

  it("preserves lastUsedAt during optimistic rename", async () => {
    const lastUsedIso = "2026-06-05T12:00:00.000Z";
    let rejectRename: ((e: unknown) => void) | undefined;
    renameMock.mockReturnValue(
      new Promise((_res, rej) => {
        rejectRename = rej;
      }),
    );

    await renderList([makeTagWithLastUsed("t1", "original", 5, lastUsedIso)]);

    const content = document.body.textContent ?? "";
    expect(content).toContain("最終使用");
    expect(content).toContain("2026");

    // Rename the tag
    await act(async () => {
      buttonByText("リネーム").click();
    });
    const input = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="text"]'),
    ).find((el) => el.value === "original");
    if (!input) throw new Error("rename input not found");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "renamed");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      buttonByText("保存").click();
    });
    await flush();

    // lastUsedAt should still be displayed after optimistic rename
    const contentAfterRename = document.body.textContent ?? "";
    expect(contentAfterRename).toContain("最終使用");
    expect(contentAfterRename).toContain("2026");

    // Resolve the rename to ensure cleanup
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
  });

  it("preserves lastUsedAt after optimistic delete + revert", async () => {
    const iso1 = "2026-05-20T12:00:00.000Z";
    const iso2 = "2026-06-03T12:00:00.000Z";
    let rejectDelete: ((e: unknown) => void) | undefined;
    deleteMock.mockReturnValue(
      new Promise<void>((_res, rej) => {
        rejectDelete = rej;
      }),
    );

    await renderList([
      makeTagWithLastUsed("t1", "alpha", 2, iso1),
      makeTagWithLastUsed("t2", "beta", 4, iso2),
    ]);

    // Both tags have dates before delete
    let ul = container.querySelector("ul");
    let rows = Array.from(ul?.querySelectorAll("li") ?? []);
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain("2026");
    expect(rows[1]?.textContent).toContain("2026");

    // Delete alpha
    const deleteBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim().includes("削除"));
    await act(async () => {
      deleteBtn?.click();
    });
    const confirmBtn = document.body
      .querySelector<HTMLElement>('[role="alertdialog"]')
      ?.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => {
      confirmBtn?.click();
    });
    await flush();

    // alpha removed → only beta remains
    ul = container.querySelector("ul");
    rows = Array.from(ul?.querySelectorAll("li") ?? []);
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toContain("2026");

    // Revert the delete (fail the server call)
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

    // Both tags back, both still have lastUsedAt displayed
    ul = container.querySelector("ul");
    rows = Array.from(ul?.querySelectorAll("li") ?? []);
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain("2026");
    expect(rows[1]?.textContent).toContain("2026");
  });
});
