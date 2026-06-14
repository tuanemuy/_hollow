// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import { HOME_SEARCH } from "@/components/auth/links";
import type {
  AccountDeletionImpactDTO,
  UserDTO,
} from "@/core/application/dto/identity";

/**
 * P24 multi-step confirm (#573). The destructive button stays disabled
 * until every step is satisfied (agree + DELETE + username + password).
 * Server (non-validation) errors surface in a form-level role=alert
 * without navigating away; success clears the AppShell cache before
 * navigating home (#728).
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

const IMPACT: AccountDeletionImpactDTO = {
  noteCount: 12,
  mediaCount: 3,
  mediaTotalBytes: 1024 * 1024,
  publicNoteCount: 4,
  activeShareLinkCount: 2,
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
    root.render(<AccountDeleteForm user={USER} impact={IMPACT} />);
  });
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function input(name: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (el === null) throw new Error(`input ${name} missing`);
  return el;
}

function checkAgree() {
  const checkbox = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (checkbox === null) throw new Error("checkbox missing");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "checked",
  )?.set;
  act(() => {
    setter?.call(checkbox, true);
    checkbox.dispatchEvent(new Event("click", { bubbles: true }));
  });
}

function typeConfirmWord(value: string) {
  // The confirm-word input is the only text input that is neither
  // `confirmation` nor `currentPassword`.
  const el = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="text"]'),
  ).find((i) => i.getAttribute("name") === null);
  if (el === undefined) throw new Error("confirm-word input missing");
  setNativeValue(el, value);
}

function deleteButton(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("アカウントを完全に削除する"),
  );
  if (btn === undefined) throw new Error("delete button missing");
  return btn as HTMLButtonElement;
}

function fillAll() {
  checkAgree();
  typeConfirmWord("DELETE");
  setNativeValue(input("confirmation"), "alice");
  setNativeValue(input("currentPassword"), "secret123");
}

describe("AccountDeleteForm impact list", () => {
  it("renders the aggregated impact counts and emphasizes 取り消せません", () => {
    render();
    expect(container.textContent).toContain("12 件");
    expect(container.textContent).toContain("2 本");
    const emphasized = Array.from(container.querySelectorAll("strong")).some(
      (el) => (el.textContent ?? "").includes("取り消せません"),
    );
    expect(emphasized).toBe(true);
  });
});

describe("AccountDeleteForm disabled gate", () => {
  it("keeps the delete button disabled until all steps are satisfied", () => {
    render();
    expect(deleteButton().disabled).toBe(true);

    checkAgree();
    expect(deleteButton().disabled).toBe(true);

    typeConfirmWord("delete"); // wrong case
    expect(deleteButton().disabled).toBe(true);
    typeConfirmWord("DELETE");
    expect(deleteButton().disabled).toBe(true);

    setNativeValue(input("confirmation"), "bob"); // wrong username
    expect(deleteButton().disabled).toBe(true);
    setNativeValue(input("confirmation"), "alice");
    expect(deleteButton().disabled).toBe(true); // password still empty

    setNativeValue(input("currentPassword"), "secret123");
    expect(deleteButton().disabled).toBe(false);
  });
});

describe("AccountDeleteForm success navigation (Issue #728)", () => {
  it("clears the AppShell cache before navigating to / on delete success", async () => {
    deleteAccount.mockResolvedValue(undefined);
    render();
    fillAll();

    await act(async () => {
      deleteButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(clearCache.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0],
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/", search: HOME_SEARCH });
    expect(document.body.querySelectorAll('[role="alert"]')).toHaveLength(1); // only the impact alert
  });

  it("forwards only confirmation + currentPassword + confirmWord to the server fn", async () => {
    deleteAccount.mockResolvedValue(undefined);
    render();
    fillAll();
    await act(async () => {
      deleteButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(deleteAccount).toHaveBeenCalledWith({
      data: {
        confirmation: "alice",
        currentPassword: "secret123",
        confirmWord: "DELETE",
      },
    });
  });
});

describe("AccountDeleteForm server error", () => {
  it("surfaces a form-level error without navigating away", async () => {
    deleteAccount.mockRejectedValue(new Error("boom"));
    render();
    fillAll();

    await act(async () => {
      deleteButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    // Impact alert (1) + the form-level server error (1).
    const alerts = Array.from(
      container.querySelectorAll('[role="alert"]'),
    ).filter((el) => (el.textContent ?? "").length > 0);
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });
});
