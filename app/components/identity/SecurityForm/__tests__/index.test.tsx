// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { UserDTO } from "@/core/application/dto/identity";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { serverFn, invalidate } = vi.hoisted(() => ({
  serverFn: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

vi.mock("@tanstack/react-start", () => ({
  // SecurityForm dispatches useServerFn three times; a single fallback is
  // enough since these tests render only.
  useServerFn: useServerFnRouter([], serverFn),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

const { SecurityForm } = await import("../index");

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
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  serverFn.mockReset();
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
    root.render(<SecurityForm user={USER} />);
  });
}

describe("SecurityForm new-password strength help", () => {
  it("states the real domain rule (12 chars, 2+ varieties)", () => {
    render();
    expect(container.textContent).toContain(
      "12文字以上。英字・数字・記号のうち2種以上を含めてください。",
    );
  });

  it("wires the help text to the new-password input via aria-describedby", () => {
    render();
    const input = container.querySelector<HTMLInputElement>(
      'input[name="newPassword"]',
    );
    expect(input).not.toBeNull();
    const describedBy = input?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const help = describedBy
      ? container.querySelector(`#${CSS.escape(describedBy)}`)
      : null;
    expect(help?.textContent).toContain("12文字以上");
    expect(help?.textContent).toContain("2種以上");
  });
});
