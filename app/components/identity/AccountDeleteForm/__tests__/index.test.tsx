// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import { HOME_SEARCH } from "@/components/auth/links";
import type { UserDTO } from "@/core/application/dto/identity";

/**
 * Issue #421: server (non-validation) errors must keep the confirm dialog
 * open and surface in-dialog, instead of closing it and showing an outer
 * summary (the "modal disappeared = success" anti-pattern #98/#420 removed
 * everywhere else). Validation errors (username mismatch) stay adjacent to
 * the input as before (#98 ADR-003).
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { deleteAccount, navigate, clearCache } = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  navigate: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate, clearCache }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([], deleteAccount),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

const { AccountDeleteForm } = await import("../index");

const USER: UserDTO = {
  id: "user-1",
  username: "alice",
  email: "alice@example.test",
  displayName: "Alice",
  bio: null,
  avatarMediaId: null,
  role: "member",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSavedAt: "2026-01-01T00:00:00.000Z",
  lastUsernameChangedAt: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  deleteAccount.mockReset();
  navigate.mockReset().mockResolvedValue(undefined);
  clearCache.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render() {
  act(() => {
    root.render(<AccountDeleteForm user={USER} />);
  });
}

function getDialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="alertdialog"]');
}

function openDialog() {
  const trigger = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("続けて削除する"),
  );
  act(() => {
    trigger?.click();
  });
}

function typeConfirmation(value: string) {
  const input = getDialog()?.querySelector<HTMLInputElement>(
    'input[name="confirmation"]',
  );
  if (input === null || input === undefined) throw new Error("input missing");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit() {
  const confirmBtn = getDialog()?.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  act(() => {
    confirmBtn?.click();
  });
}

describe("AccountDeleteForm section description", () => {
  it("emphasizes 「取り消せません」 in a <strong> (not plain text)", () => {
    render();
    const strongs = Array.from(container.querySelectorAll("strong"));
    const emphasized = strongs.some((el) =>
      (el.textContent ?? "").includes("取り消せません"),
    );
    expect(emphasized).toBe(true);
  });
});

describe("AccountDeleteForm validation error (Issue #421 — regression guard)", () => {
  it("keeps the dialog open and shows the mismatch error next to the input, without calling the server", () => {
    render();
    openDialog();
    typeConfirmation("not-alice");
    submit();

    const dialog = getDialog();
    expect(dialog).not.toBeNull();
    // Validation never reaches the server.
    expect(deleteAccount).not.toHaveBeenCalled();
    // The mismatch message is rendered adjacent to the input (its own
    // role=alert wired through the input's aria-describedby), and the input
    // is flagged invalid.
    const input = dialog?.querySelector<HTMLInputElement>(
      'input[name="confirmation"]',
    );
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input?.getAttribute("aria-describedby") ?? "";
    const nearInputErrors = describedBy
      .split(" ")
      .filter(Boolean)
      .map((id) => dialog?.querySelector(`#${CSS.escape(id)}`))
      .filter((el) => el?.getAttribute("role") === "alert");
    expect(nearInputErrors).toHaveLength(1);
    expect(nearInputErrors[0]?.textContent).toContain(
      "ユーザー名が一致しません",
    );
  });
});

describe("AccountDeleteForm success navigation (Issue #728)", () => {
  it("clears the AppShell cache before navigating to / on delete success", async () => {
    deleteAccount.mockResolvedValue(undefined);
    render();
    openDialog();
    typeConfirmation("alice");

    await act(async () => {
      submit();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    // race 回避の核心: clearCache（AppShell 破棄）が navigate より先に呼ばれる。
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(clearCache.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0],
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/", search: HOME_SEARCH });
    // 退会は未認証ランディング行きで、成功時はダイアログが閉じエラーが残らない。
    expect(document.body.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });
});

describe("AccountDeleteForm server error (Issue #421)", () => {
  it("keeps the dialog open and surfaces the error in-dialog when the server rejects", async () => {
    deleteAccount.mockRejectedValue(
      new Error("boom"), // extractSerializedError maps unknowns to a system error
    );
    render();
    openDialog();
    typeConfirmation("alice");

    await act(async () => {
      submit();
      // Let the rejected transition settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    // Dialog stays open (no "modal disappeared = success").
    const dialog = getDialog();
    expect(dialog).not.toBeNull();
    // The server error renders inside the dialog as a role=alert region.
    const alerts = Array.from(
      dialog?.querySelectorAll('[role="alert"]') ?? [],
    ).filter((el) => (el.textContent ?? "").length > 0);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    // No outer summary leaks into the section body (it was removed).
    const outsideAlert = Array.from(
      container.querySelectorAll('[role="alert"]'),
    );
    expect(outsideAlert).toHaveLength(0);
    // Did not navigate away on failure.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("discards the error when the dialog is cancelled", async () => {
    deleteAccount.mockRejectedValue(new Error("boom"));
    render();
    openDialog();
    typeConfirmation("alice");
    await act(async () => {
      submit();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getDialog()).not.toBeNull();

    const cancelBtn = Array.from(
      getDialog()?.querySelectorAll("button") ?? [],
    ).find((b) => b.textContent?.includes("キャンセル"));
    act(() => {
      cancelBtn?.click();
    });

    // Dialog closed and no error survives anywhere on the page.
    expect(getDialog()).toBeNull();
    expect(document.body.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });
});
