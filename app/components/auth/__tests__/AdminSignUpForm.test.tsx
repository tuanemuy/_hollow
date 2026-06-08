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
 * The admin-setup form-error summaries follow the `.alert alert-error` 案D
 * structure — both the Setup Token error branch (invalid / disabled titles)
 * and the general registration-failure summary.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { adminSignUp, invalidate } = vi.hoisted(() => ({
  adminSignUp: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ invalidate }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([], adminSignUp),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

const { AdminSignUpForm } = await import("../AdminSignUpForm/index");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  adminSignUp.mockReset();
  invalidate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render() {
  act(() => {
    root.render(<AdminSignUpForm />);
  });
}

function submit() {
  const form = container.querySelector("form") as HTMLFormElement;
  act(() => {
    form.requestSubmit();
  });
}

function alertWithTitle(title: string): HTMLElement | undefined {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[role="alert"]'),
  ).find((el) => (el.textContent ?? "").includes(title));
}

async function submitWith(error: unknown) {
  adminSignUp.mockRejectedValue(error);
  render();
  await act(async () => {
    submit();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AdminSignUpForm Setup Token error", () => {
  it("shows an invalid-token 案D alert for invalid_setup_token", async () => {
    await submitWith({
      kind: "unauthorized",
      code: "invalid_setup_token",
      message: "Setup Token が正しくありません。",
    });
    const alert = alertWithTitle("Setup Token が正しくありません。");
    expect(alert).toBeDefined();
    // 案D structure asserted positively: white surface + hairline border.
    expect(alert?.className).toContain("bg-bg");
    expect(alert?.className).toContain("border");
    expect(alert?.className).toContain("var(--color-error)");
    expect(alert?.className).not.toContain("bg-error-surface");
    expect(alert?.querySelector("svg")).not.toBeNull();
    expect(alert?.textContent).toContain(
      "値を確認してもう一度入力してください。",
    );
  });

  it("shows a disabled-token 案D alert for setup_token_disabled", async () => {
    await submitWith({
      kind: "unauthorized",
      code: "setup_token_disabled",
      message: "Setup Token が設定されていません。",
    });
    const alert = alertWithTitle("Setup Token が設定されていません。");
    expect(alert).toBeDefined();
    expect(alert?.className).toContain("var(--color-error)");
  });
});

describe("AdminSignUpForm general failure summary", () => {
  it("shows a `.alert alert-error` 案D block for non-token failures", async () => {
    await submitWith({ kind: "system", code: null, message: "boom" });
    const alert = alertWithTitle("登録に失敗しました。");
    expect(alert).toBeDefined();
    // Body carries the `displayError(system)` output, not the raw mock message.
    expect(alert?.textContent).toContain("システムエラーが発生しました");
    expect(alert?.textContent).not.toContain("boom");
    // 案D structure asserted positively: white surface + hairline border.
    expect(alert?.className).toContain("bg-bg");
    expect(alert?.className).toContain("border");
    expect(alert?.className).not.toContain("bg-error-surface");
    expect(alert?.querySelectorAll("p").length).toBe(2);
  });
});
