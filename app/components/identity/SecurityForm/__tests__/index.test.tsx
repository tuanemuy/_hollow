// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverFnChainStub } from "@/components/_test-utils/serverFnMock";
import type { SessionDTO, UserDTO } from "@/core/application/dto/identity";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Mock each server fn as a distinct spy so assertions can prove the *right*
// fn was wired — not just that *some* fn received the payload. `useServerFn`
// is an identity passthrough, so the SUT calls these spies directly.
const { revokeSessionFn, otherServerFn, invalidate } = vi.hoisted(() => ({
  revokeSessionFn: vi.fn(),
  otherServerFn: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("../action", () => ({
  changePasswordFn: otherServerFn,
  requestEmailChangeFn: otherServerFn,
  revokeAllOtherSessionsFn: otherServerFn,
  revokeSessionFn,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
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
  lastSavedAt: "2026-01-01T00:00:00.000Z",
  lastUsernameChangedAt: null,
};

const session = (overrides: Partial<SessionDTO> = {}): SessionDTO => ({
  id: "session-1",
  isCurrent: false,
  userAgent: "Mozilla/5.0",
  ipAddress: "192.0.2.41",
  createdAt: "2026-05-14T09:24:00.000Z",
  updatedAt: "2026-05-14T09:24:00.000Z",
  expiresAt: "2026-06-13T09:24:00.000Z",
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  revokeSessionFn.mockReset();
  otherServerFn.mockReset();
  invalidate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(sessions: readonly SessionDTO[] = []) {
  act(() => {
    root.render(<SecurityForm user={USER} sessions={sessions} />);
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

describe("SecurityForm active sessions list", () => {
  it("shows the 'このセッション' pill and no sign-out button on the current row", () => {
    render([session({ id: "cur", isCurrent: true })]);
    expect(container.textContent).toContain("このセッション");
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    );
    const signOutButtons = buttons.filter(
      (b) => b.textContent?.trim() === "ログアウト",
    );
    expect(signOutButtons).toHaveLength(0);
  });

  it("renders a sign-out button only for non-current rows", () => {
    render([
      session({ id: "cur", isCurrent: true }),
      session({ id: "other", isCurrent: false }),
    ]);
    const signOutButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) => b.textContent?.trim() === "ログアウト");
    expect(signOutButtons).toHaveLength(1);
  });

  it("invokes revokeSessionFn with the row's sessionId when signing out", async () => {
    revokeSessionFn.mockResolvedValue({ ok: true });
    render([session({ id: "other", isCurrent: false })]);
    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.trim() === "ログアウト");
    expect(button).not.toBeUndefined();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(revokeSessionFn).toHaveBeenCalledWith({
      data: { sessionId: "other" },
    });
    // The sign-out must go through revokeSessionFn specifically, not any
    // other server fn that happens to accept the same payload.
    expect(otherServerFn).not.toHaveBeenCalled();
  });

  it("renders the raw userAgent verbatim as the session title", () => {
    render([session({ id: "ua", userAgent: "CustomAgent/9.9" })]);
    expect(container.textContent).toContain("CustomAgent/9.9");
  });
});
