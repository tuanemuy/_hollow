// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

/**
 * Issue #546: the Login form-error summary follows the `.alert alert-error`
 * 案D structure. The unverified `role=status` alert and validation field
 * errors are regression-guarded — they must NOT collapse into the error
 * summary path.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { login, resend, invalidate, navigate } = vi.hoisted(() => ({
  login: vi.fn(),
  resend: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ invalidate, navigate }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([], login),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

const { LoginForm } = await import("../LoginForm/index");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  login.mockReset();
  resend.mockReset();
  invalidate.mockReset().mockResolvedValue(undefined);
  navigate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render() {
  act(() => {
    root.render(<LoginForm />);
  });
}

function submit() {
  const form = container.querySelector("form") as HTMLFormElement;
  act(() => {
    form.requestSubmit();
  });
}

describe("LoginForm submit failure summary (Issue #546)", () => {
  it("renders the failure summary as a `.alert alert-error` 案D block", async () => {
    login.mockRejectedValue({
      kind: "unauthorized",
      code: "invalid_credentials",
      message: "メールアドレスまたはパスワードが正しくありません。",
    });
    render();
    await act(async () => {
      submit();
      await Promise.resolve();
      await Promise.resolve();
    });

    const alert = container.querySelector('[role="alert"]') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain("ログインできませんでした。");
    expect(alert.className).toContain("var(--color-error)");
    expect(alert.className).not.toContain("bg-error-surface");
    expect(alert.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(alert.querySelectorAll("p").length).toBe(2);
  });

  it("keeps the unverified case as a `role=status` alert, not the error summary (regression)", async () => {
    login.mockRejectedValue({
      kind: "unauthorized",
      code: "unverified",
      message: "メールアドレスの確認が完了していません。",
    });
    render();
    await act(async () => {
      submit();
      await Promise.resolve();
      await Promise.resolve();
    });

    // No error summary surfaces.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const status = container.querySelector('[role="status"]') as HTMLElement;
    expect(status).not.toBeNull();
    expect(status.textContent).toContain("メールアドレスの確認が未完了です");
  });

  it("keeps validation field errors adjacent to the input, not in the summary (regression)", async () => {
    login.mockRejectedValue({
      kind: "validation",
      code: null,
      message: "入力内容を確認してください。",
      fieldErrors: { email: ["メールアドレスの形式が正しくありません。"] },
    });
    render();
    await act(async () => {
      submit();
      await Promise.resolve();
      await Promise.resolve();
    });

    // No error summary for validation errors.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const emailInput = container.querySelector(
      'input[name="email"]',
    ) as HTMLInputElement;
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain(
      "メールアドレスの形式が正しくありません。",
    );
  });
});
