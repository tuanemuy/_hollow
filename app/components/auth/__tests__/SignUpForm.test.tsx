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
 * The SignUp form-error summary follows the `.alert alert-error` 案D structure
 * (white surface + error hairline + leading icon + title/body). `role="alert"`
 * is retained.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { signUp, invalidate } = vi.hoisted(() => ({
  signUp: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ invalidate }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([], signUp),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

const { SignUpForm } = await import("../SignUpForm/index");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  signUp.mockReset();
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
    root.render(<SignUpForm />);
  });
}

function submit() {
  const form = container.querySelector("form") as HTMLFormElement;
  act(() => {
    form.requestSubmit();
  });
}

describe("SignUpForm submit failure summary", () => {
  it("renders the failure summary as a `.alert alert-error` 案D block, not a filled box", async () => {
    signUp.mockRejectedValue({
      kind: "system",
      code: null,
      message: "boom",
    });
    render();
    await act(async () => {
      submit();
      await Promise.resolve();
      await Promise.resolve();
    });

    const alert = container.querySelector('[role="alert"]') as HTMLElement;
    expect(alert).not.toBeNull();
    // Title 案D copy.
    expect(alert.textContent).toContain("登録に失敗しました。");
    // Body carries the `displayError(system)` output, not the raw mock message.
    expect(alert.textContent).toContain("システムエラーが発生しました");
    expect(alert.textContent).not.toContain("boom");
    // 案D structure asserted positively: white surface + hairline border.
    expect(alert.className).toContain("bg-bg");
    expect(alert.className).toContain("border");
    // Error semantic modifier + white-surface base, never the old filled box.
    expect(alert.className).toContain("--alert-accent");
    expect(alert.className).toContain("var(--color-error)");
    expect(alert.className).not.toContain("bg-error-surface");
    // Leading decorative icon + title/body paragraphs.
    expect(alert.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(alert.querySelectorAll("p").length).toBe(2);
  });

  it("does not show the summary on the initial render", () => {
    render();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
